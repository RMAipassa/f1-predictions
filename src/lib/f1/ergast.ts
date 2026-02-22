type ErgastResponse = {
  MRData?: {
    RaceTable?: { Races?: any[] };
    DriverTable?: { Drivers?: any[] };
    ConstructorTable?: { Constructors?: any[] };
  };
};

function baseUrl() {
  return (process.env.F1_RESULTS_BASE_URL || 'https://api.jolpi.ca/ergast').replace(/\/$/, '');
}

async function getJson(path: string): Promise<ErgastResponse> {
  const res = await fetch(`${baseUrl()}${path}`, { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`F1 API error ${res.status} for ${path}`);
  return (await res.json()) as ErgastResponse;
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

    return {
      season_year: seasonYear,
      round: Number(r.round),
      name: String(r.raceName ?? `Round ${r.round}`),
      circuit_name: String(r.Circuit?.circuitName ?? ''),
      quali_start: qualiStart ? qualiStart.toISOString() : null,
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
