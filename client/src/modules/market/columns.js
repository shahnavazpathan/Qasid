import { date, gmp, num, priceBand, rupees, signed, times } from "../../shared/lib/format.js";

const price = { label: "Price", value: priceBand };
const gmpCol = { label: "GMP", value: ipo => gmp(ipo)?.text ?? "—" };
const subscribed = { label: "Subscribed", value: ipo => times(ipo.subscription?.total) };

// Columns per board status. The last column is the one kept on small screens.
export const COLUMNS = {
  open: [price, { label: "Closes", value: i => date(i.closeDate) }, subscribed, gmpCol],
  upcoming: [price, { label: "Opens", value: i => date(i.openDate) }, { label: "Lot", value: i => num(i.lotSize) }, gmpCol],
  closed: [price, { label: "Allotment", value: i => date(i.allotmentDate) }, subscribed, gmpCol],
  listed: [
    { label: "Issue", value: i => rupees(i.issuePrice || i.priceMax) },
    { label: "Listed", value: i => date(i.listingDate) },
    subscribed,
    { label: "Gain", value: i => signed(i.listingGain, "%") }
  ]
};
