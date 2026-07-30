export type IncomeType = "business" | "miscellaneous";

export type Book = {
  id: string;
  incomeType: IncomeType;
};

export type BookState = {
  books: Book[];
  activeBookId: string;
};
