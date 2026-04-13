// aeon-effect — Effect ecosystem integration for Aeon reactive streams
//
// Subpath exports:
//   aeon-effect/Event            — EventTypeLambda + canonical typeclass instances
//   aeon-effect/Event/Zip        — newtype with zip-based SemiApplicative
//   aeon-effect/Event/Sequential — newtype with chain-based Monad
//   aeon-effect/bridge           — toStream / fromStream

export { toStream, fromStream, type ToStreamOptions } from "./bridge.js"
