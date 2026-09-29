const express = require("express");
const { authenticate, authorize, OWNER_LEVEL_ROLES } = require("../middleware/auth");
const { Op, fn, col, literal } = require("sequelize");
const {
  Remittance,
  BusModel,
  User,
  RemittanceExpense,
  Trip,
  Route,
  Ticket,
  PassengerCount,
  sequelize,
} = require("../models");
const {
  buildDailyForecast,
  buildUtilForecast,
} = require("../services/forecast/buildForecast");
const { buildInsights } = require("../services/insights/buildInsights");

const router = express.Router();
router.use(authenticate, authorize(...OWNER_LEVEL_ROLES));

// GET /api/owner/dashboard
// Optional ?from=YYYY-MM-DD&to=YYYY-MM-DD — filters the range-based KPIs and
// the daily passenger chart. Defaults to the current month when omitted.
router.get("/dashboard", async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const { from, to } = req.query;
    let rangeStart, rangeEnd;
    if (from && to && !isNaN(Date.parse(from)) && !isNaN(Date.parse(to))) {
      rangeStart = new Date(`${from}T00:00:00`);
      rangeEnd = new Date(`${to}T23:59:59.999`);
    } else {
      rangeStart = new Date(now.getFullYear(), now.getMonth(), 1);
      rangeEnd = now;
    }
    // Comparison window: the immediately preceding period of equal length.
    const rangeMs = rangeEnd.getTime() - rangeStart.getTime();
    const prevRangeEnd = new Date(rangeStart.getTime() - 1);
    const prevRangeStart = new Date(prevRangeEnd.getTime() - rangeMs);

    // ── KPI: Net gross within the selected range ───────────────────────────
    const netGrossInRange =
      (await Remittance.sum("net_gross", {
        where: {
          status: "approved",
          submitted_at: { [Op.between]: [rangeStart, rangeEnd] },
        },
      })) || 0;
    const netGrossPrevRange =
      (await Remittance.sum("net_gross", {
        where: {
          status: "approved",
          submitted_at: { [Op.between]: [prevRangeStart, prevRangeEnd] },
        },
      })) || 0;

    // ── KPI: Passenger counts via raw SQL ─────────────────────────────────
    const [pcInRange] = await sequelize.query(
      `SELECT COALESCE(SUM(pc.count),0) AS total
       FROM passenger_counts pc
       JOIN trips t ON t.id = pc.trip_id
       WHERE t.departure_time BETWEEN :start AND :end`,
      {
        replacements: { start: rangeStart, end: rangeEnd },
        type: sequelize.QueryTypes.SELECT,
      },
    );
    const passengerCountInRange = Number(pcInRange.total) || 0;

    const [pcPrevRange] = await sequelize.query(
      `SELECT COALESCE(SUM(pc.count),0) AS total
       FROM passenger_counts pc
       JOIN trips t ON t.id = pc.trip_id
       WHERE t.departure_time BETWEEN :start AND :end`,
      {
        replacements: { start: prevRangeStart, end: prevRangeEnd },
        type: sequelize.QueryTypes.SELECT,
      },
    );
    const passengerCountPrevRange = Number(pcPrevRange.total) || 0;

    const passengerGrowth =
      passengerCountPrevRange > 0
        ? (
            ((passengerCountInRange - passengerCountPrevRange) /
              passengerCountPrevRange) *
            100
          ).toFixed(1)
        : null;

    // ── KPI: Bus utilisation ───────────────────────────────────────────────
    const totalBuses = await BusModel.count({ where: { status: "active" } });
    const busesInUseToday = await Trip.count({
      distinct: true,
      col: "bus_id",
      where: {
        status: { [Op.in]: ["ongoing", "completed"] },
        departure_time: { [Op.between]: [todayStart, todayEnd] },
      },
    });
    const busUtilRate =
      totalBuses > 0 ? Math.round((busesInUseToday / totalBuses) * 100) : 0;

    // ── KPI: Remittance counts ─────────────────────────────────────────────
    const remittanceApproved = await Remittance.count({
      where: { status: "approved" },
    });
    const remittanceTotal = await Remittance.count();
    const remittancePending = await Remittance.count({
      where: { status: "submitted" },
    });

    // ── Daily passenger volume within the selected range (raw SQL) ────────
    const dailyPassengersRaw = await sequelize.query(
      `SELECT t.departure_time::date AS date, COALESCE(SUM(pc.count),0) AS total
       FROM trips t
       LEFT JOIN passenger_counts pc ON pc.trip_id = t.id
       WHERE t.departure_time BETWEEN :start AND :end
       GROUP BY t.departure_time::date
       ORDER BY t.departure_time::date ASC`,
      {
        replacements: { start: rangeStart, end: rangeEnd },
        type: sequelize.QueryTypes.SELECT,
      },
    );

    // ── Route profitability (via trips) ───────────────────────────────────
    const routeProfit = await sequelize.query(
      `SELECT t.route_id, r.origin, r.destination,
              SUM(t.grand_total) AS revenue,
              COUNT(t.id) AS trip_count
       FROM trips t
       JOIN routes r ON r.id = t.route_id
       WHERE t.status = 'completed'
       GROUP BY t.route_id, r.origin, r.destination
       ORDER BY revenue DESC
       LIMIT 6`,
      { type: sequelize.QueryTypes.SELECT },
    );

    // ── Peak hour analysis (last 30 days) ─────────────────────────────────
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);
    const peakHoursRaw = await sequelize.query(
      `SELECT EXTRACT(HOUR FROM issued_at)::int AS hour,
              SUM(COALESCE(passenger_count, 1)) AS ticket_count
       FROM tickets
       WHERE issued_at >= :since
       GROUP BY EXTRACT(HOUR FROM issued_at)::int
       ORDER BY hour ASC`,
      {
        replacements: { since: thirtyDaysAgo },
        type: sequelize.QueryTypes.SELECT,
      },
    );

    // ── Weekday vs weekend passengers (last 12 weeks) ─────────────────────
    const twelveWeeksAgo = new Date(now);
    twelveWeeksAgo.setDate(now.getDate() - 84);
    const weekdayWeekendRaw = await sequelize.query(
      `SELECT EXTRACT(MONTH FROM t.departure_time) AS month,
              EXTRACT(DOW FROM t.departure_time) AS dow,
              COALESCE(SUM(pc.count),0) AS total
       FROM trips t
       LEFT JOIN passenger_counts pc ON pc.trip_id = t.id
       WHERE t.departure_time >= :since
       GROUP BY EXTRACT(MONTH FROM t.departure_time), EXTRACT(DOW FROM t.departure_time)
       ORDER BY month ASC`,
      {
        replacements: { since: twelveWeeksAgo },
        type: sequelize.QueryTypes.SELECT,
      },
    );

    // ── Remittance trend (last 12 months) ─────────────────────────────────
    const twelveMonthsAgo = new Date(now);
    twelveMonthsAgo.setMonth(now.getMonth() - 11);
    const remittanceTrend = await sequelize.query(
      `SELECT EXTRACT(YEAR FROM submitted_at) AS year,
              EXTRACT(MONTH FROM submitted_at) AS month,
              SUM(net_collection) AS net_collection,
              SUM(gross_income) AS gross_income
       FROM remittances
       WHERE status = 'approved' AND submitted_at >= :since
       GROUP BY EXTRACT(YEAR FROM submitted_at), EXTRACT(MONTH FROM submitted_at)
       ORDER BY year ASC, month ASC`,
      {
        replacements: { since: twelveMonthsAgo },
        type: sequelize.QueryTypes.SELECT,
      },
    );

    // ── Trip performance within the range (for insights) ──────────────────
    const [tripPerf] = await sequelize.query(
      `SELECT COUNT(*) FILTER (WHERE status = 'completed') AS completed,
              COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
              COUNT(actual_departure_time) AS departures_recorded,
              AVG(EXTRACT(EPOCH FROM (actual_departure_time - departure_time)) / 60)
                FILTER (WHERE actual_departure_time IS NOT NULL) AS avg_delay_min
       FROM trips
       WHERE departure_time BETWEEN :start AND :end`,
      {
        replacements: { start: rangeStart, end: rangeEnd },
        type: sequelize.QueryTypes.SELECT,
      },
    );

    const insights = buildInsights({
      passengersInRange: passengerCountInRange,
      passengersPrevRange: passengerCountPrevRange,
      passengerGrowthPct: passengerGrowth,
      netGrossInRange,
      netGrossPrevRange,
      routeProfit,
      peakHours: peakHoursRaw,
      weekdayWeekend: weekdayWeekendRaw,
      busUtilisationRate: busUtilRate,
      totalBuses,
      busesInUseToday,
      remittancePending,
      tripsCompleted: Number(tripPerf?.completed) || 0,
      tripsCancelled: Number(tripPerf?.cancelled) || 0,
      avgDepartureDelayMin:
        tripPerf?.avg_delay_min != null ? Number(tripPerf.avg_delay_min) : null,
      tripsWithActualDeparture: Number(tripPerf?.departures_recorded) || 0,
    });

    return res.json({
      insights,
      range: {
        from: rangeStart.toISOString().split("T")[0],
        to: rangeEnd.toISOString().split("T")[0],
      },
      kpi: {
        net_gross_in_range: netGrossInRange,
        passenger_count_in_range: passengerCountInRange,
        passenger_growth_pct: passengerGrowth,
        bus_utilisation_rate: busUtilRate,
        total_buses: totalBuses,
        buses_in_use_today: busesInUseToday,
        remittance_approved: remittanceApproved,
        remittance_total: remittanceTotal,
        remittance_pending: remittancePending,
      },
      daily_passengers: dailyPassengersRaw,
      route_profit: routeProfit,
      peak_hours: peakHoursRaw,
      weekday_weekend: weekdayWeekendRaw,
      remittance_trend: remittanceTrend,
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
});

// GET /api/owner/remittances
router.get("/remittances", async (req, res) => {
  try {
    const remittances = await Remittance.findAll({
      include: [
        { model: BusModel, attributes: ["id", "bus_number", "plate_number"] },
        {
          model: User,
          as: "driver",
          attributes: ["id", "first_name", "last_name", "employee_id"],
        },
        {
          model: User,
          as: "conductor",
          attributes: ["id", "first_name", "last_name", "employee_id"],
        },
        {
          model: User,
          as: "approver",
          attributes: ["id", "first_name", "last_name"],
        },
      ],
      order: [["submitted_at", "DESC"]],
    });
    return res.json(remittances);
  } catch (error) {
    console.error("Error fetching remittances:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
});

// GET /api/owner/remittances/:id
router.get("/remittances/:id", async (req, res) => {
  try {
    const remittance = await Remittance.findByPk(req.params.id, {
      include: [
        { model: BusModel, attributes: ["id", "bus_number", "plate_number"] },
        {
          model: User,
          as: "driver",
          attributes: ["id", "first_name", "last_name", "employee_id"],
        },
        {
          model: User,
          as: "conductor",
          attributes: ["id", "first_name", "last_name", "employee_id"],
        },
        {
          model: User,
          as: "approver",
          attributes: ["id", "first_name", "last_name"],
        },
        {
          model: RemittanceExpense,
          attributes: ["id", "expense_type", "amount"],
        },
        {
          model: Trip,
          attributes: [
            "id",
            "trip_number",
            "departure_time",
            "grand_total",
            "ticket_number_start",
            "ticket_number_end",
          ],
          include: [{ model: Route, attributes: ["origin", "destination"] }],
        },
      ],
    });
    if (!remittance)
      return res.status(404).json({ message: "Remittance not found." });
    return res.json(remittance);
  } catch (error) {
    console.error("Error fetching remittance:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/owner/forecast
// Forecasting & predictive analytics — ML (Random Forest) when enough data is
// available, falling back to statistical methods otherwise (see
// server/services/forecast/buildForecast.js).
// ═══════════════════════════════════════════════════════════════════════════
router.get("/forecast", async (req, res) => {
  try {
    const now = new Date();

    // ── 1. Daily passenger data – last 90 days ───────────────────────────
    const ninetyDaysAgo = new Date(now);
    ninetyDaysAgo.setDate(now.getDate() - 90);
    const dailyRaw = await sequelize.query(
      `SELECT t.departure_time::date AS date, COALESCE(SUM(pc.count),0) AS total
       FROM trips t
       LEFT JOIN passenger_counts pc ON pc.trip_id = t.id
       WHERE t.departure_time >= :since
       GROUP BY t.departure_time::date
       ORDER BY t.departure_time::date ASC`,
      {
        replacements: { since: ninetyDaysAgo },
        type: sequelize.QueryTypes.SELECT,
      },
    );

    // Build dense daily array (fill gaps with 0)
    const dailyMap = {};
    for (const r of dailyRaw) {
      dailyMap[r.date.toISOString().split("T")[0]] = Number(r.total);
    }
    const dailyDense = [];
    for (let i = 89; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      dailyDense.push({
        date: key,
        passengers: dailyMap[key] ?? 0,
        dow: d.getDay(),
      });
    }

    // ── 2-4. Passenger trend + seasonality + 7-day forecast (ML or fallback) ─
    const passengerRows = dailyDense.map((d) => ({
      date: d.date,
      value: d.passengers,
    }));
    const passengerResult = buildDailyForecast(passengerRows, {
      daysAhead: 7,
      useSeasonalBlend: false,
    });
    const seasonalFactors = passengerResult.seasonalFactors;
    const passengerForecast7 = passengerResult.predictions.map((p) => ({
      date: p.date,
      predicted: p.predicted,
      dow: new Date(`${p.date}T00:00:00`).getDay(),
    }));

    // ── 5. Revenue data – last 90 days ───────────────────────────────────
    const revenueRaw = await sequelize.query(
      `SELECT t.departure_time::date AS date, COALESCE(SUM(t.grand_total),0) AS revenue
       FROM trips t
       WHERE t.departure_time >= :since AND t.status = 'completed'
       GROUP BY t.departure_time::date
       ORDER BY t.departure_time::date ASC`,
      {
        replacements: { since: ninetyDaysAgo },
        type: sequelize.QueryTypes.SELECT,
      },
    );

    const revMap = {};
    for (const r of revenueRaw)
      revMap[r.date.toISOString().split("T")[0]] = Number(r.revenue);
    const revDense = [];
    for (let i = 89; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      revDense.push({ date: key, value: revMap[key] ?? 0 });
    }
    const revenueResult = buildDailyForecast(revDense, {
      daysAhead: 7,
      useSeasonalBlend: true,
    });
    const revenueForecast7 = revenueResult.predictions;

    // ── 7. Predicted revenue / passengers tomorrow (single KPI) ─────────
    const tomorrowDow = new Date(now);
    tomorrowDow.setDate(now.getDate() + 1);
    const predictedPassengersTomorrow = passengerForecast7[0]?.predicted ?? 0;
    const predictedRevenueTomorrow = revenueForecast7[0]?.predicted ?? 0;

    // Growth % relative to today's actual
    const todayKey = now.toISOString().split("T")[0];
    const todayPassengers = dailyMap[todayKey] ?? 0;
    const todayRevenue = revMap[todayKey] ?? 0;
    const passengerGrowthTomorrow =
      todayPassengers > 0
        ? (
            ((predictedPassengersTomorrow - todayPassengers) /
              todayPassengers) *
            100
          ).toFixed(1)
        : null;
    const revenueGrowthTomorrow =
      todayRevenue > 0
        ? (
            ((predictedRevenueTomorrow - todayRevenue) / todayRevenue) *
            100
          ).toFixed(1)
        : null;

    // ── 8. Bus utilisation forecast (ML or exponential-smoothing fallback) ──
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);
    const utilRaw = await sequelize.query(
      `SELECT t.departure_time::date AS date,
              COUNT(DISTINCT t.bus_id)::float / GREATEST(:total,1) * 100 AS util_pct
       FROM trips t
       WHERE t.departure_time >= :since AND t.status IN ('ongoing','completed')
       GROUP BY t.departure_time::date
       ORDER BY t.departure_time::date ASC`,
      {
        replacements: {
          since: ninetyDaysAgo,
          total: Math.max(
            1,
            await BusModel.count({ where: { status: "active" } }),
          ),
        },
        type: sequelize.QueryTypes.SELECT,
      },
    );
    const utilRows = utilRaw.map((r) => ({
      date: r.date.toISOString().split("T")[0],
      value: Number(r.util_pct),
    }));
    const utilResult = buildUtilForecast(utilRows);
    const predictedUtilTomorrow = utilResult.predictedTomorrow;

    // ── 9. Peak hours forecast (average by hour across last 30 days) ──────
    const peakForecast = await sequelize.query(
      `SELECT sub.hour,
              AVG(sub.daily_count) AS avg_tickets
       FROM (
         SELECT DATE(issued_at) AS day,
                EXTRACT(HOUR FROM issued_at)::int AS hour,
                SUM(COALESCE(passenger_count, 1)) AS daily_count
         FROM tickets
         WHERE issued_at >= :since
         GROUP BY DATE(issued_at), EXTRACT(HOUR FROM issued_at)
       ) sub
       GROUP BY sub.hour
       ORDER BY avg_tickets DESC
       LIMIT 3`,
      {
        replacements: { since: thirtyDaysAgo },
        type: sequelize.QueryTypes.SELECT,
      },
    );

    // ── 10. Combined actual + forecast series (last 7 actual + next 7 pred) for chart
    const last7Actual = dailyDense
      .slice(-7)
      .map((d) => ({ date: d.date, value: d.passengers, type: "actual" }));
    const next7Forecast = passengerForecast7.map((d) => ({
      date: d.date,
      value: d.predicted,
      type: "forecast",
    }));
    const demandSeries = [...last7Actual, ...next7Forecast];

    return res.json({
      kpi_forecast: {
        predicted_passengers_tomorrow: predictedPassengersTomorrow,
        passenger_growth_pct_tomorrow: passengerGrowthTomorrow,
        predicted_revenue_tomorrow: predictedRevenueTomorrow,
        revenue_growth_pct_tomorrow: revenueGrowthTomorrow,
        predicted_bus_utilisation_tomorrow: predictedUtilTomorrow,
      },
      demand_series: demandSeries,
      revenue_forecast_7d: revenueForecast7,
      peak_hours_forecast: peakForecast,
      seasonal_factors: seasonalFactors.map((f, i) => ({
        dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][i],
        factor: Number(f.toFixed(3)),
      })),
      forecast_method: {
        passengers: passengerResult.method,
        revenue: revenueResult.method,
        utilisation: utilResult.method,
      },
    });
  } catch (error) {
    console.error("Forecast error:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
});

module.exports = router;
