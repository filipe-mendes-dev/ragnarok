export interface ScanSnapshot {
  id: string;
  pageUrl: string;
  elements: HTMLElement[];
  markup: string[];
}

export interface ScannerWindow extends Window {
  __ragnarokScan?: ScanSnapshot | null;
}
