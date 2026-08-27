export type Telescope = {
  id: string;
  name: string;
  site: string;
  status: "observing" | "slewing" | "idle";
  altitudeKm: number;
  orbitRadius: number;
  orbitSpeed: number;
  phase: number;
  inclination: number;
  distanceTraveledKm: number;
  imagesCaptured: number;
  cleanImages: number;
  reflectionHits: number;
  fovBlocked: number;
  exposureMinutes: number;
};

export type Satellite = {
  id: string;
  name: string;
  operator: string;
  orbitRadius: number;
  orbitSpeed: number;
  phase: number;
  inclination: number;
  brightnessMag: number;
  reflective: boolean;
};

export type Incident = {
  id: string;
  timestamp: string;
  telescopeId: string;
  satelliteId: string;
  kind: "reflection" | "fov-block";
  severity: "low" | "moderate" | "severe";
  frameId: string;
  durationSec: number;
};

export const telescopes: Telescope[] = [
  {
    id: "TS-01",
    name: "Vela Array",
    site: "Cerro Pachón",
    status: "observing",
    altitudeKm: 612,
    orbitRadius: 118,
    orbitSpeed: 0.22,
    phase: 0.1,
    inclination: 0.35,
    distanceTraveledKm: 4_812_940,
    imagesCaptured: 14_302,
    cleanImages: 12_744,
    reflectionHits: 981,
    fovBlocked: 577,
    exposureMinutes: 8_412,
  },
  {
    id: "TS-02",
    name: "Kepler Ridge",
    site: "Mauna Kea",
    status: "slewing",
    altitudeKm: 548,
    orbitRadius: 152,
    orbitSpeed: 0.17,
    phase: 2.1,
    inclination: -0.22,
    distanceTraveledKm: 3_204_115,
    imagesCaptured: 9_870,
    cleanImages: 8_115,
    reflectionHits: 1_204,
    fovBlocked: 551,
    exposureMinutes: 6_044,
  },
  {
    id: "TS-03",
    name: "Halo Sentinel",
    site: "La Palma",
    status: "observing",
    altitudeKm: 780,
    orbitRadius: 186,
    orbitSpeed: 0.13,
    phase: 4.4,
    inclination: 0.55,
    distanceTraveledKm: 6_930_002,
    imagesCaptured: 21_455,
    cleanImages: 19_002,
    reflectionHits: 1_612,
    fovBlocked: 841,
    exposureMinutes: 11_930,
  },
  {
    id: "TS-04",
    name: "Nyx Aperture",
    site: "Paranal",
    status: "idle",
    altitudeKm: 495,
    orbitRadius: 96,
    orbitSpeed: 0.28,
    phase: 5.6,
    inclination: -0.44,
    distanceTraveledKm: 1_902_777,
    imagesCaptured: 5_320,
    cleanImages: 4_688,
    reflectionHits: 402,
    fovBlocked: 230,
    exposureMinutes: 3_118,
  },
];

export const satellites: Satellite[] = [
  { id: "SAT-1187", name: "Lumen-7", operator: "Orbcon", orbitRadius: 134, orbitSpeed: 0.42, phase: 1.2, inclination: 0.62, brightnessMag: 4.2, reflective: true },
  { id: "SAT-2043", name: "Helios-B", operator: "Astranet", orbitRadius: 168, orbitSpeed: 0.31, phase: 3.4, inclination: -0.31, brightnessMag: 5.8, reflective: true },
  { id: "SAT-3391", name: "Kestrel-12", operator: "Vantis", orbitRadius: 104, orbitSpeed: 0.55, phase: 0.6, inclination: 0.18, brightnessMag: 6.9, reflective: false },
  { id: "SAT-4420", name: "Aurora-3", operator: "Orbcon", orbitRadius: 198, orbitSpeed: 0.24, phase: 5.1, inclination: -0.58, brightnessMag: 3.6, reflective: true },
  { id: "SAT-5510", name: "Pilot-9", operator: "Northwind", orbitRadius: 146, orbitSpeed: 0.38, phase: 2.7, inclination: 0.42, brightnessMag: 7.4, reflective: false },
  { id: "SAT-6602", name: "Cinder-2", operator: "Vantis", orbitRadius: 122, orbitSpeed: 0.47, phase: 4.9, inclination: -0.12, brightnessMag: 5.1, reflective: true },
];

export const incidents: Incident[] = [
  { id: "EV-9021", timestamp: "04:12:38Z", telescopeId: "TS-03", satelliteId: "SAT-4420", kind: "reflection", severity: "severe", frameId: "FRM-88213", durationSec: 4.2 },
  { id: "EV-9020", timestamp: "04:09:02Z", telescopeId: "TS-01", satelliteId: "SAT-1187", kind: "fov-block", severity: "moderate", frameId: "FRM-88207", durationSec: 1.8 },
  { id: "EV-9019", timestamp: "04:03:55Z", telescopeId: "TS-02", satelliteId: "SAT-2043", kind: "reflection", severity: "moderate", frameId: "FRM-88190", durationSec: 2.6 },
  { id: "EV-9018", timestamp: "03:58:11Z", telescopeId: "TS-03", satelliteId: "SAT-6602", kind: "reflection", severity: "low", frameId: "FRM-88171", durationSec: 0.9 },
  { id: "EV-9017", timestamp: "03:51:47Z", telescopeId: "TS-01", satelliteId: "SAT-4420", kind: "fov-block", severity: "severe", frameId: "FRM-88150", durationSec: 6.1 },
  { id: "EV-9016", timestamp: "03:44:20Z", telescopeId: "TS-04", satelliteId: "SAT-3391", kind: "fov-block", severity: "low", frameId: "FRM-88122", durationSec: 1.1 },
  { id: "EV-9015", timestamp: "03:39:08Z", telescopeId: "TS-02", satelliteId: "SAT-1187", kind: "reflection", severity: "severe", frameId: "FRM-88104", durationSec: 5.4 },
  { id: "EV-9014", timestamp: "03:30:52Z", telescopeId: "TS-03", satelliteId: "SAT-2043", kind: "reflection", severity: "low", frameId: "FRM-88081", durationSec: 1.3 },
];

export const interferenceByHour = [
  { hour: "20:00", reflections: 4, blocks: 2 },
  { hour: "21:00", reflections: 7, blocks: 3 },
  { hour: "22:00", reflections: 11, blocks: 4 },
  { hour: "23:00", reflections: 9, blocks: 6 },
  { hour: "00:00", reflections: 14, blocks: 5 },
  { hour: "01:00", reflections: 18, blocks: 8 },
  { hour: "02:00", reflections: 12, blocks: 7 },
  { hour: "03:00", reflections: 16, blocks: 9 },
  { hour: "04:00", reflections: 21, blocks: 6 },
];

export const fleetTotals = telescopes.reduce(
  (acc, t) => ({
    distanceTraveledKm: acc.distanceTraveledKm + t.distanceTraveledKm,
    imagesCaptured: acc.imagesCaptured + t.imagesCaptured,
    cleanImages: acc.cleanImages + t.cleanImages,
    reflectionHits: acc.reflectionHits + t.reflectionHits,
    fovBlocked: acc.fovBlocked + t.fovBlocked,
    exposureMinutes: acc.exposureMinutes + t.exposureMinutes,
  }),
  {
    distanceTraveledKm: 0,
    imagesCaptured: 0,
    cleanImages: 0,
    reflectionHits: 0,
    fovBlocked: 0,
    exposureMinutes: 0,
  },
);

export const fmt = (n: number) => n.toLocaleString("en-US");
export const fmtCompact = (n: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
