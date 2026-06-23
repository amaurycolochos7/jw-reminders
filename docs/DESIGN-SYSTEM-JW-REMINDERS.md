# Design System — JW Reminders

## Principios

1. **Institucional y sobrio** — Inspirado en JW.org, JW Library, Apple HIG
2. **Mobile-first** — Diseñado para móvil, adaptado a escritorio
3. **Premium y limpio** — Espacios amplios, sombras suaves, bordes redondeados
4. **Consistente** — Tokens de diseño aplicados globalmente

---

## Paleta de colores

### Primary (Azul institucional)
| Token | Hex | Uso |
|---|---|---|
| primary-50 | #EEF4FF | Fondos sutiles, badges |
| primary-100 | #D9E6FF | Hover states |
| primary-200 | #B3CCFF | Borders activos |
| primary-500 | #4A6FA5 | Botones, links, accents |
| primary-600 | #3D5D8A | Hover de botones |
| primary-700 | #2E4A6E | Texto activo |

### Neutrales (Slate)
| Token | Uso |
|---|---|
| slate-50 | Background principal del contenido |
| slate-100 | Bordes de sidebar |
| slate-200 | Bordes de inputs |
| slate-500 | Texto secundario |
| slate-700 | Texto de labels |
| slate-900 | Texto principal |

### Semánticos
| Color | Uso |
|---|---|
| emerald-500 | Éxito, conectado, activo |
| amber-500 | Advertencia, esperando |
| red-500 | Error, desconectado |

---

## Tipografía

- **Font:** Inter (Google Fonts)
- **Base:** 14px (text-sm para body)
- **Headings:** font-semibold
  - h1: text-2xl (24px)
  - h2: text-xl (20px)
  - h3: text-lg (18px)
- **Labels:** text-sm font-medium text-slate-700
- **Body:** text-sm text-slate-600
- **Caption:** text-xs text-slate-500

---

## Espaciado y bordes

| Token | Valor | Uso |
|---|---|---|
| rounded-xl | 12px | Inputs, botones, nav items |
| rounded-2xl | 16px | Cards |
| rounded-3xl | 24px | Card de login, modales premium |
| shadow-soft | 0 2px 8px rgba(0,0,0,0.04) | Cards normales |
| shadow-card | 0 4px 24px rgba(0,0,0,0.06) | Cards hover |
| shadow-elevated | 0 12px 48px rgba(0,0,0,0.12) | Modales, drawers |

---

## Componentes

### Button
- Variants: `primary`, `secondary`, `danger`, `ghost`
- Sizes: `sm`, `md`, `lg`
- Border radius: rounded-xl
- Primary: gradient from-primary-500 to-primary-600
- Hover: scale-[1.02] (primary), bg-slate-50 (secondary)
- Active: scale-[0.98]
- Loading: spinner + disabled state

### Card
- Background: white
- Border radius: rounded-2xl
- Shadow: shadow-soft
- Padding: sm (p-4), md (p-5), lg (p-6)
- Hover variant: shadow-card transition

### Input
- Border radius: rounded-xl
- Border: border-slate-200
- Focus: ring-2 ring-primary-500 border-primary-500
- Error: border-red-300 + error message
- Padding: px-4 py-2.5

### Badge
- Variants: success, warning, error, info, neutral
- Shape: rounded-full px-2.5 py-0.5
- Typography: text-xs font-medium
- Optional dot indicator

### StatusDot
- Colors: green, yellow, red, gray
- Size: w-2.5 h-2.5
- Optional pulse animation

---

## Layout

### Sidebar (Desktop)
- Width: 280px
- Background: white
- Border: border-r border-slate-100
- Position: sticky top-0
- Nav items: px-4 py-2.5, rounded-xl
- Active: bg-primary-50 text-primary-600
- Hover: bg-slate-50

### Sidebar (Mobile)
- Slide-in drawer from left
- Backdrop: bg-black/30 backdrop-blur-sm
- Width: 280px
- Trigger: hamburger button in fixed top bar

### Content area
- Background: bg-slate-50
- Padding: p-4 (mobile), p-6 (desktop)

---

## Animaciones

| Nombre | Uso |
|---|---|
| fadeIn | Entrada de cards, login |
| slideUp | Alertas, toasts |
| slideDown | Dropdown menus |
| ping | StatusDot pulse |

---

## Login Page

- Fondo: gradient from-primary-50/60 to-white
- Card: max-w-sm, rounded-3xl, shadow-card, border-slate-100
- Logo: gradient circle con "JW", rounded-2xl
- Título: "JW Reminders", font-bold text-xl
- Subtítulo: muted, text-sm
- Inputs: labeled, rounded-xl
- Button: full-width, gradient primary
- Error: red alert with icon, slideUp animation
- Loading: spinner in button

---

## Dashboard

- Header: título + fecha actual
- Stats: grid 2/4 cols, cards con icon circles
- Asignaciones: tabla/lista en card
- Estado sistema: dots + labels
- Recordatorios: lista full-width
- Empty states: icon + texto + acción

---

## Inspiración visual

- Apple iCloud login
- Apple Settings sidebar
- Apple Developer dashboard
- JW Library app (blue institutional)
- JW.org (clean, white, blue accents)
- Vercel dashboard (cards, stats)
- Linear app (clean interface)
