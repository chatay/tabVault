# TabVault - Project Instructions

## Code Quality Principles

- Long-term solutions are always preferred over short-term workarounds. Do not patch around problems — fix the root cause.
- Writing good, maintainable code is crucial. Prioritize clarity, simplicity, and correctness over quick fixes.
- When facing a choice between a fast hack and a proper solution, choose the proper solution.
- Database-level enforcement is the source of truth — client-side checks are a UX convenience layer, not a security boundary.

## Styling Rules (STRICT)

- **NEVER use inline `style={{}}` in React components.** All styles go in CSS files.
- Use CSS classes defined in `src/styles/globals.css` (or component-specific `.css` files if needed).
- CSS variables (`var(--surface)`, `var(--text-primary)`, etc.) are used via CSS classes, not inline styles.
- Tailwind utility classes are acceptable for simple layout (flex, gap, padding, margin, sizing).
- Anything involving colors, borders, shadows, backgrounds, or transitions must be a CSS class.
- Component files (`.tsx`) should contain only logic and structure — no visual styling inline.

## Component Structure

- Keep components focused — single responsibility.
- Extract reusable UI patterns into CSS classes (e.g., `.card`, `.badge`, `.btn`).
- Constants and magic numbers belong in `src/lib/constants.ts`, not scattered in components.

## SOLID Principles

- **Single Responsibility**: Each file/function/component does one thing. A component renders UI — it doesn't fetch data, transform data, AND render. Split them.
- **Open/Closed**: Design modules to be extendable without modifying existing code. Use props, composition, and callbacks — not hardcoded conditions.
- **Liskov Substitution**: If a component accepts `TabGroup`, it must work with any valid `TabGroup` — no hidden assumptions about specific fields being present.
- **Interface Segregation**: Don't force components to accept props they don't use. Split large prop interfaces into smaller focused ones.
- **Dependency Inversion**: Components depend on abstractions (types/interfaces), not concrete implementations. Pass services via props or hooks, don't import them directly in UI components.

## No Magic Values

- **No magic numbers**: Every number that isn't self-obvious (0, 1, -1) must be a named constant in `src/lib/constants.ts`.
- **No magic strings**: Status values, storage keys, event names, error messages — all defined as constants or enums. Never use a raw string like `'blocked'` or `'tabvault_settings'` in more than one place.
- **One source of truth**: Every piece of data or config has exactly one canonical location. If a value is used in 2+ places, it must come from a single constant/type/function.

## Code Organization

- **Pure functions first**: Business logic (`duplicates.ts`, `categorize.ts`) must be pure — no side effects, no storage calls, no API calls. Easy to test, easy to reason about.
- **Separation of concerns**: Data layer (`lib/`) → Hook layer (`hooks/`) → UI layer (`components/`, `entrypoints/`). Data flows down, events flow up.
- **DRY but don't over-abstract**: Extract when you see the same pattern 3+ times. Two similar lines are fine. Premature abstraction is worse than duplication.
- **Explicit over implicit**: Name things clearly. `getDuplicateCountForGroup` is better than `getCount`. Avoid abbreviations that aren't universally known.
- **Fail loudly at boundaries, gracefully inside**: Validate inputs at system boundaries (API responses, user input, storage reads). Internal code can trust types.
- **Colocation**: Tests live next to what they test (`tests/unit/X.test.ts` for `src/lib/X.ts`). CSS classes are named after the component they serve.
