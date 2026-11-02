// GENERATED from RainViewer's official colour table CSV
// (https://www.rainviewer.com/files/rainviewer_api_colors_table.csv, "Universal Blue" column,
// downloaded 2026-11-02). The CSV lists 128 rain rows followed by 128 snow rows, keyed by dBZ.
// Values are HEX RGBA. Only every 5 dBZ is kept here; nothing is interpolated or invented.
// Regenerate rather than hand-edit.

export interface PaletteStop {
  /** Radar reflectivity in dBZ, exactly as listed in the provider CSV. */
  dbz: number;
  rain: string;
  snow: string;
}

export const UNIVERSAL_BLUE_STOPS: readonly PaletteStop[] = [
  { dbz: -10, rain: "#63615914", snow: "#cfffff00" },
  { dbz: -5, rain: "#726e612e", snow: "#cbffff3f" },
  { dbz: 0, rain: "#827b6949", snow: "#c7ffff7f" },
  { dbz: 5, rain: "#92887164", snow: "#c3ffffbf" },
  { dbz: 10, rain: "#cec08796", snow: "#bfffffff" },
  { dbz: 15, rain: "#88ddeeff", snow: "#9fdfffff" },
  { dbz: 20, rain: "#00a3e0ff", snow: "#7fbfffff" },
  { dbz: 25, rain: "#0077aaff", snow: "#5f9fffff" },
  { dbz: 30, rain: "#005588ff", snow: "#4f8fffff" },
  { dbz: 35, rain: "#ffee00ff", snow: "#3f7fffff" },
  { dbz: 40, rain: "#ffaa00ff", snow: "#2f6fffff" },
  { dbz: 45, rain: "#ff4400ff", snow: "#1f5fffff" },
  { dbz: 50, rain: "#c10000ff", snow: "#0f4fffff" },
  { dbz: 55, rain: "#ffaaffff", snow: "#003fffff" },
  { dbz: 60, rain: "#ff77ffff", snow: "#002fffff" },
  { dbz: 65, rain: "#ffffffff", snow: "#001fffff" },
  { dbz: 70, rain: "#ffffffff", snow: "#000fffff" },
  { dbz: 75, rain: "#00ff00ff", snow: "#0000ffff" },
];
