/** Extensions for 3D models and printable files, grouped by canonical name. */
export const MODEL_FORMATS = [
  "STL", "3MF", "STEP", "OBJ", "IGES", "F3D", "SCAD", "FCSTD", "SLDPRT", "BLEND", "FBX",
  "GLB", "GLTF", "DAE", "SKP", "C4D", "MA", "PLY", "USD", "USDZ", "GCODE", "BGCODE",
] as const;

export type ModelFormat = (typeof MODEL_FORMATS)[number];

export function isModelFormat(value: string | null): value is ModelFormat {
  return MODEL_FORMATS.some((format) => format === value);
}

export function formatsFromNames(names: readonly string[]): ModelFormat[] {
  const formats = new Set<ModelFormat>();
  for (const name of names) {
    const ext = name.trim().match(/\.(\w+)$/)?.[1]?.toUpperCase();
    const format = ext === "STP" ? "STEP" : ext === "IGS" ? "IGES" : ext ?? null;
    if (isModelFormat(format)) formats.add(format);
  }
  return [...formats];
}
