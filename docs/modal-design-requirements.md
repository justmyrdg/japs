# Modal Design Requirements

Design standards for all modal dialogs in the JAPS system.

---

## 1. Structure

Every modal must follow this layer order:

```
fixed overlay (z-50)
└── backdrop (bg-black/40 backdrop-blur-sm, closes on click)
└── modal card (.alert-modal-card)
    ├── header  (title + close button)
    ├── body    (content / form)
    └── footer  (action buttons)
```

---

## 2. Sizing

| Type          | Width Class | Use Case                        |
| ------------- | ----------- | ------------------------------- |
| Alert/Confirm | `max-w-md`  | Info, success, error, warning   |
| Form modal    | `max-w-xl`  | CRUD forms (users, buses, etc.) |
| Large modal   | `max-w-2xl` | Tables, reports, previews       |

- Always `w-full` so it scales on small screens.
- Add `max-h-[90vh] overflow-y-auto` on tall forms.

---

## 3. Spacing & Border Radius

| Property      | Value                                             |
| ------------- | ------------------------------------------------- |
| Padding       | `p-8`                                             |
| Border radius | `rounded-lg` (consistent with inputs and buttons) |
| Shadow        | `shadow-2xl`                                      |

> **Rule:** Use only `rounded-lg` throughout the system — never mix `rounded-xl`, `rounded-2xl`, etc.

---

## 4. Header

```html
<div class="flex items-center justify-between mb-6">
	<h3 class="text-lg font-semibold text-gray-900">Modal Title</h3>
	<button
		(click)="close()"
		class="text-gray-400 hover:text-gray-600 cursor-pointer">
		<i class="pi pi-times"></i>
	</button>
</div>
```

---

## 5. Form Layout

- **Always 1 column** — `flex flex-col gap-4`
- Never use multi-column grids in modals
- Label above input, `text-xs font-medium text-gray-600 mb-1`
- Input: `w-full border rounded-lg px-3 py-2.5 text-sm`
- Focus ring: `focus:border-[#1E5AAA] focus:ring-2 focus:ring-[#1E5AAA]/20`
- Error state border: `border-red-400`
- Error message: `text-red-500 text-xs mt-0.5`

### Required Fields

- Append `<span class="text-red-500">*</span>` after the label text on all required fields
- Add a note at the bottom of the form: `<p class="text-xs text-gray-400"><span class="text-red-500">*</span> Required fields</p>`

---

## 6. Footer / Actions

```html
<div class="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
	<!-- Secondary (cancel) -->
	<button
		class="px-5 py-2.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer">
		Cancel
	</button>
	<!-- Primary (confirm) -->
	<button
		class="px-5 py-2.5 rounded-lg text-sm font-semibold bg-[#1E5AAA] hover:bg-[#174d93] text-white transition-colors cursor-pointer">
		Save
	</button>
</div>
```

For **destructive** actions (delete), use `bg-red-500 hover:bg-red-600` on the confirm button.

---

## 7. Alert / Confirm Modals

Used for success, error, warning, info feedback. Triggered via `AlertService`.

| Type    | Icon                      | Icon bg        | Icon color       |
| ------- | ------------------------- | -------------- | ---------------- |
| success | `pi-check-circle`         | `bg-green-100` | `text-green-500` |
| error   | `pi-times-circle`         | `bg-red-100`   | `text-red-500`   |
| warning | `pi-exclamation-triangle` | `bg-amber-100` | `text-amber-500` |
| info    | `pi-info-circle`          | `bg-blue-100`  | `text-[#1E5AAA]` |

Icon container: `inline-flex items-center justify-center w-16 h-16 rounded-full`

---

## 8. Animation

All modal cards must use the `.alert-modal-card` class which applies:

```css
animation: alert-pop 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) both;
```

This provides a subtle bounce-in effect on open.

---

## 9. Accessibility

- Backdrop click → close modal
- Close (`×`) button always present in header
- `cursor-pointer` on all interactive elements
- `novalidate` on forms (validation handled in Angular)

---

## 10. Colors (Theme Reference)

| Usage          | Value      |
| -------------- | ---------- |
| Primary        | `#1E5AAA`  |
| Primary hover  | `#174d93`  |
| Primary active | `#103e7a`  |
| Destructive    | `red-500`  |
| Backdrop       | `black/40` |
| Font           | Poppins    |
