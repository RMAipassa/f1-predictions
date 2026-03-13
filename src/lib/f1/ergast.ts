type ErgastResponse = {
  MRData?: {
    RaceTable?: { Races?: any[] };
    DriverTable?: { Drivers?: any[] };
    ConstructorTable?: { Constructors?: any[] };
  };
};

function baseUrls() {
  const primary = (process.env.F1_RESULTS_BASE_URL || 'https://api.jolpi.ca/ergast').replace(/\/$/, '');
  const envFallback = (process.env.F1_RESULTS_FALLBACK_BASE_URL || '').replace(/\/$/, '');
  const urls = [primary, envFallback].filter(Boolean);
  return Array.from(new Set(urls));
}

async function getJson(path: string): Promise<ErgastResponse> {
  let lastError: Error | null = null;

  for (const base of baseUrls()) {
    try {
      const res = await fetch(`${base}${path}`, { next: { revalidate: 0 } });
      if (!res.ok) throw new Error(`F1 API error ${res.status} for ${path}`);
      return (await res.json()) as ErgastResponse;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }

  throw lastError ?? new Error(`F1 API error for ${path}`);
}

export async function fetchSeasonCalendar(seasonYear: number) {
  const json = await getJson(`/f1/${seasonYear}.json`);
  const races = json.MRData?.RaceTable?.Races ?? [];
  return races.map((r) => {
    const date = r.date as string | undefined;
    const time = r.time as string | undefined;
    const raceStart = date ? new Date(`${date}T${time ?? '00:00:00Z'}`) : null;

    const qDate = r.Qualifying?.date as string | undefined;
    const qTime = r.Qualifying?.time as string | undefined;
    const qualiStart = qDate ? new Date(`${qDate}T${qTime ?? '00:00:00Z'}`) : null;

    const sprintRaceDate = r.Sprint?.date as string | undefined;
    const sprintRaceTime = r.Sprint?.time as string | undefined;
    const sprintRaceStart = sprintRaceDate ? new Date(`${sprintRaceDate}T${sprintRaceTime ?? '00:00:00Z'}`) : null;

    const sprintQualiObj = r.SprintQualifying || r.SprintShootout || r.SprintShootoutQualifying;
    const sprintQualiDate = sprintQualiObj?.date as string | undefined;
    const sprintQualiTime = sprintQualiObj?.time as string | undefined;
    const sprintQualiStart = sprintQualiDate ? new Date(`${sprintQualiDate}T${sprintQualiTime ?? '00:00:00Z'}`) : null;

    return {
      season_year: seasonYear,
      round: Number(r.round),
      name: String(r.raceName ?? `Round ${r.round}`),
      circuit_name: String(r.Circuit?.circuitName ?? ''),
      quali_start: qualiStart ? qualiStart.toISOString() : null,
      sprint_quali_start: sprintQualiStart ? sprintQualiStart.toISOString() : null,
      sprint_race_start: sprintRaceStart ? sprintRaceStart.toISOString() : null,
      race_start: raceStart ? raceStart.toISOString() : null,
    };
  });
}

export async function fetchSeasonDrivers(seasonYear: number) {
  const json = await getJson(`/f1/${seasonYear}/drivers.json?limit=1000`);
  const drivers = json.MRData?.DriverTable?.Drivers ?? [];
  return drivers.map((d) => ({
    driver_id: String(d.driverId),
    code: d.code ? String(d.code) : null,
    given_name: d.givenName ? String(d.givenName) : null,
    family_name: d.familyName ? String(d.familyName) : null,
    permanent_number: d.permanentNumber ? String(d.permanentNumber) : null,
  }));
}

export async function fetchSeasonConstructors(seasonYear: number) {
  const json = await getJson(`/f1/${seasonYear}/constructors.json?limit=1000`);
  const constructors = json.MRData?.ConstructorTable?.Constructors ?? [];
  return constructors.map((c) => ({
    constructor_id: String(c.constructorId),
    name: String(c.name ?? c.constructorId),
  }));
}

export async function fetchQualifyingPoleDriverId(seasonYear: number, round: number) {
  const json = await getJson(`/f1/${seasonYear}/${round}/qualifying.json`);
  const race = (json.MRData?.RaceTable?.Races ?? [])[0];
  const q1 = race?.QualifyingResults?.[0];
  const driverId = q1?.Driver?.driverId;
  return driverId ? String(driverId) : null;
}

export async function fetchRacePodiumDriverIds(seasonYear: number, round: number) {
  const json = await getJson(`/f1/${seasonYear}/${round}/results.json`);
  const race = (json.MRData?.RaceTable?.Races ?? [])[0];
  const results = race?.Results ?? [];
  const p1 = results?.[0]?.Driver?.driverId ? String(results[0].Driver.driverId) : null;
  const p2 = results?.[1]?.Driver?.driverId ? String(results[1].Driver.driverId) : null;
  const p3 = results?.[2]?.Driver?.driverId ? String(results[2].Driver.driverId) : null;
  return { p1, p2, p3, raw: json };
}

export async function fetchSprintPoleDriverId(seasonYear: number, round: number) {
  const paths = [
    `/f1/${seasonYear}/${round}/sprintqualifying.json`,
    `/f1/${seasonYear}/${round}/sprintshootout.json`,
    `/f1/${seasonYear}/${round}/sprintshootoutresults.json`,
  ];

  for (const path of paths) {
    try {
      const json = await getJson(path);
      const race = (json.MRData?.RaceTable?.Races ?? [])[0];
      const q1 = race?.SprintQualifyingResults?.[0] ?? race?.SprintShootoutResults?.[0];
      const driverId = q1?.Driver?.driverId;
      if (driverId) return String(driverId);
    } catch {
      // try next endpoint
    }
  }

  return null;
}

export async function fetchSprintGridPoleDriverId(seasonYear: number, round: number) {
  const paths = [`/f1/${seasonYear}/${round}/sprint.json`, `/f1/${seasonYear}/${round}/sprintresults.json`];

  for (const path of paths) {
    try {
      const json = await getJson(path);
      const race = (json.MRData?.RaceTable?.Races ?? [])[0];
      const results = race?.SprintResults ?? race?.Results ?? [];
      const onGridPole = results.find((r: any) => String(r?.grid ?? '') === '1');
      const gridPoleId = onGridPole?.Driver?.driverId;
      if (gridPoleId) return String(gridPoleId);
    } catch {
      // try next endpoint
    }
  }

  return null;
}

type OpenF1Session = {
  session_key?: number;
  date_start?: string;
};

type OpenF1SessionResult = {
  position?: number;
  driver_number?: number;
};

async function getOpenF1Json<T>(pathWithQuery: string): Promise<T> {
  const res = await fetch(`https://api.openf1.org/v1${pathWithQuery}`, { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`OpenF1 API error ${res.status} for ${pathWithQuery}`);
  return (await res.json()) as T;
}

export async function fetchOpenF1SprintQualiPoleDriverNumber(seasonYear: number, scheduledSprintQualiStart?: string | null) {
  const qs = new URLSearchParams({ year: String(seasonYear), session_name: 'Sprint Qualifying' });
  const sessions = await getOpenF1Json<OpenF1Session[]>(`/sessions?${qs.toString()}`);
  if (!Array.isArray(sessions) || sessions.length === 0) return null;

  let selected = sessions[0];
  const targetTs = scheduledSprintQualiStart ? new Date(String(scheduledSprintQualiStart)).getTime() : NaN;
  if (Number.isFinite(targetTs)) {
    let bestDiff = Number.POSITIVE_INFINITY;
    for (const s of sessions) {
      const ts = s?.date_start ? new Date(String(s.date_start)).getTime() : NaN;
      if (!Number.isFinite(ts)) continue;
      const diff = Math.abs(ts - targetTs);
      if (diff < bestDiff) {
        bestDiff = diff;
        selected = s;
      }
    }
  }

  const sessionKey = Number(selected?.session_key ?? 0);
  if (!Number.isFinite(sessionKey) || sessionKey <= 0) return null;

  const results = await getOpenF1Json<OpenF1SessionResult[]>(`/session_result?session_key=${sessionKey}`);
  const winner = (results ?? []).find((r) => Number(r?.position) === 1 && Number.isFinite(Number(r?.driver_number)));
  return winner?.driver_number ? String(winner.driver_number) : null;
}

export async function fetchSprintPodiumDriverIds(seasonYear: number, round: number) {
  const paths = [`/f1/${seasonYear}/${round}/sprint.json`, `/f1/${seasonYear}/${round}/sprintresults.json`];

  for (const path of paths) {
    try {
      const json = await getJson(path);
      const race = (json.MRData?.RaceTable?.Races ?? [])[0];
      const results = race?.SprintResults ?? race?.Results ?? [];
      const p1 = results?.[0]?.Driver?.driverId ? String(results[0].Driver.driverId) : null;
      const p2 = results?.[1]?.Driver?.driverId ? String(results[1].Driver.driverId) : null;
      const p3 = results?.[2]?.Driver?.driverId ? String(results[2].Driver.driverId) : null;
      if (p1 || p2 || p3) return { p1, p2, p3, raw: json };
    } catch {
      // try next endpoint
    }
  }

  return { p1: null, p2: null, p3: null, raw: null };
}
