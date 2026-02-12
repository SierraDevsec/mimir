---
paths:
  - "src/**/*.tsx"
  - "src/**/*.jsx"
---

# React Rules

## Components
- One component per file
- Keep components small and focused (single responsibility)
- Use semantic HTML and proper ARIA attributes
- Handle loading, error, and empty states

## State
- Use functional setState to prevent stale closures
- Bad: `setCount(count + 1)`
- Good: `setCount(prev => prev + 1)`
- Lift state only when necessary — colocate state with its consumer

## Performance
- react-compiler is enabled — do NOT use useMemo, useCallback, React.memo for memoization
- Exception: useCallback IS used for `useQuery` fetcher refs (referential identity for deps, not memoization)
- Avoid creating objects/arrays in JSX props (causes re-renders)
- Use dynamic imports for heavy components: `lazy(() => import('./Heavy'))`

## Styling
- Use Tailwind CSS utility classes
- Extract repeated patterns to components, not CSS classes
- Use `clsx` or `tailwind-merge` for conditional classes