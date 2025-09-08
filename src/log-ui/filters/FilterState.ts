export class FilterState {
  private svcFilter = new Map<string, string>();
  private svcSearch = new Map<string, string>();
  constructor(
    private globalFilter = "",
    private globalSearch = "",
    public activeService: string | null = null
  ) {}

  getFilterFor(name: string) {
    return this.svcFilter.get(name) ?? this.globalFilter;
  }
  getSearchFor(name: string) {
    return this.svcSearch.get(name) ?? this.globalSearch;
  }

  setFilterForScope(text: string) {
    this.activeService
      ? this.svcFilter.set(this.activeService, text)
      : (this.globalFilter = text);
  }
  setSearchForScope(text: string) {
    this.activeService
      ? this.svcSearch.set(this.activeService, text)
      : (this.globalSearch = text);
  }

  getCurrentFilterText() {
    return this.activeService
      ? this.svcFilter.get(this.activeService) ?? ""
      : this.globalFilter;
  }
  getCurrentSearchText() {
    return this.activeService
      ? this.svcSearch.get(this.activeService) ?? ""
      : this.globalSearch;
  }

  clearCurrentScope() {
    if (this.activeService) {
      this.svcFilter.delete(this.activeService);
      this.svcSearch.delete(this.activeService);
    } else {
      this.globalFilter = "";
      this.globalSearch = "";
    }
  }

  matches(name: string, text: string) {
    const f = this.getFilterFor(name);
    const s = this.getSearchFor(name);

    // Case insensitive filter matching
    if (f && !text.toLowerCase().includes(f.toLowerCase())) return false;

    if (s) {
      try {
        if (!new RegExp(s, "i").test(text)) return false;
      } catch {
        if (!text.toLowerCase().includes(s.toLowerCase())) return false;
      }
    }

    return true;
  }
}
