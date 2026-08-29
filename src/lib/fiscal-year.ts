type Era = {
  name: string;
  startYear: number;
};

const eras: Era[] = [
  { name: "令和", startYear: 2019 },
  { name: "平成", startYear: 1989 },
  { name: "昭和", startYear: 1926 },
  { name: "大正", startYear: 1912 },
  { name: "明治", startYear: 1868 }
];

export function japaneseEraForFiscalYear(year: number): string {
  if (!Number.isInteger(year) || year < 1868 || year > 9999) {
    throw new RangeError("Fiscal year must be an integer between 1868 and 9999");
  }

  const era = eras.find((candidate) => year >= candidate.startYear);
  if (!era) throw new RangeError("Fiscal year predates the supported Japanese eras");
  const eraYear = year - era.startYear + 1;
  return `${era.name}${eraYear === 1 ? "元" : eraYear}`;
}

export function fiscalYearTranslationParams(year: number): { year: number; era: string } {
  return { year, era: japaneseEraForFiscalYear(year) };
}
