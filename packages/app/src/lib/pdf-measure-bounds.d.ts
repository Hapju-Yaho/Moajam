type Measure = {
    page: number;
    system: number;
    bounds: number[];
};
/** Each staff system has one shared vertical extent. */
export declare function normalizeMeasureRows<T extends Measure>(rows: T[]): T[];
/** Move shared barlines together, retaining at least one coordinate unit per bar. */
export declare function changeMeasureBounds<T extends Measure>(rows: T[], selected: number, bounds: number[]): T[];
export {};
