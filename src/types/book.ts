export type ConsumptionTaxStatus = "taxable" | "exempt";

export type Book = {
  id: string;
  name: string;
  consumptionTaxStatus: ConsumptionTaxStatus;
};

export type BookState = {
  books: Book[];
  activeBookId: string;
};
