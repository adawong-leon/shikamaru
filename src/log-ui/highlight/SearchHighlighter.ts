import chalk from "chalk";
import { FilterState } from "../filters/FilterState";
import { Highlighter } from "./Highlighter";

export class SearchHighlighter implements Highlighter {
  constructor(private readonly filters: FilterState) {}
  highlight(text: string, service: string) {
    const s = this.filters.getSearchFor(service);
    if (!s) return text;
    const highlightStyle = (m: string) => chalk.bold.underline.blue.bgWhite(m);
    try {
      return text.replace(new RegExp(s, "gi"), highlightStyle);
    } catch {
      return text.split(s).join(highlightStyle(s));
    }
  }
}
