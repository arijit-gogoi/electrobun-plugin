// Ambient shims for transitively-imported deps we don't use directly.
// Without these, `bun tsc --noEmit` walks into electrobun's TS source
// and complains about types for packages that are not part of our surface.

declare module "three";
