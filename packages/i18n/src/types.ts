import type { en } from './en.js';

/** Same shape as the English catalog, with every leaf widened to `string`. */
type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };
export type Catalog = Widen<typeof en>;

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];
/** Every valid dotted message key, e.g. "errors.not_found". */
export type MessageKey = Leaves<typeof en>;
