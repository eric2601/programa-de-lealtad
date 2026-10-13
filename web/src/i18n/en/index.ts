import { common } from './common';
import { bomba } from './bomba';
import { portal } from './portal';
import { admin } from './admin';
import { charts } from './charts';

/** Diccionario español → inglés. La clave es el texto exacto en español que aparece en el código. */
export const EN: Record<string, string> = { ...common, ...bomba, ...portal, ...admin, ...charts };
