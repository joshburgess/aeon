# aeon-types

Core type definitions for [Aeon](https://github.com/joshburgess/aeon), a denotationally-designed reactive programming library for TypeScript.

This package contains the foundational types that the rest of Aeon builds on:

- Branded `Time`, `Duration`, and `Offset` types
- The `Event<A, E>` and `Behavior<A, E>` opaque type interfaces
- `Sink<A, E>`, `Source<A, E>`, `Disposable`, and `Scheduler` interfaces
- Higher-kinded type encoding (URI-to-Kind map, `Functor`, `Applicative`, `Monad`, `Filterable`)

You typically don't depend on `aeon-types` directly — it's a transitive dependency of [`aeon-core`](https://www.npmjs.com/package/aeon-core), [`aeon-scheduler`](https://www.npmjs.com/package/aeon-scheduler), and the other Aeon packages.

## Installation

```bash
pnpm add aeon-types
```

## Documentation

- [Main README](https://github.com/joshburgess/aeon#readme)
- [Getting Started](https://github.com/joshburgess/aeon/blob/main/docs/getting-started.md)
- [Denotational Semantics](https://github.com/joshburgess/aeon/blob/main/docs/semantics.md)

## License

MIT
