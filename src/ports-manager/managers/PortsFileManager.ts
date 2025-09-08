import fs from "fs";
import path from "path";
import { PortsAssignments, Mode, PortsFileFormat } from "../types";
import { PortsError } from "../errors/PortsError";

export class PortsFileManager {
  private filePath: string;

  constructor(private config: { projectsDir: string; portsFile?: string }) {
    this.filePath =
      config.portsFile || path.join(config.projectsDir, "ports-map.json");
  }

  async loadPorts(): Promise<PortsAssignments | null> {
    try {
      if (!this.fileExists()) {
        return null;
      }

      const raw = await this.readFile();
      let parsed: unknown;

      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        throw PortsError.fromFileError(error, this.filePath);
      }

      if (!Array.isArray(parsed)) {
        throw new PortsError(
          "Invalid ports file format: expected array",
          null,
          "INVALID_FORMAT"
        );
      }

      const assignments: PortsAssignments = {};

      for (const row of parsed as PortsFileFormat[]) {
        const service = String(row.Service ?? "");
        const internal = Number(row["Internal Port"] ?? 0);
        const host = Number(row["Host Port"] ?? 0);

        if (service && Number.isFinite(internal) && Number.isFinite(host)) {
          assignments[service] = { internal, host };
        } else {
          console.warn(
            `⚠️ Skipping invalid port entry: ${JSON.stringify(row)}`
          );
        }
      }

      return assignments;
    } catch (error) {
      if (error instanceof PortsError) {
        throw error;
      }
      throw PortsError.fromFileError(error, this.filePath);
    }
  }

  async savePorts(assignments: PortsAssignments, mode: Mode): Promise<void> {
    try {
      // Convert to human-friendly format
      const rows: PortsFileFormat[] = Object.entries(assignments).map(
        ([service, ports]) => ({
          Service: service,
          "Internal Port": ports.internal,
          "Host Port": ports.host,
          Mode: mode,
          Updated: new Date().toISOString(),
        })
      );

      // Add creation timestamp for new entries
      if (!this.fileExists()) {
        rows.forEach((row) => {
          row.Created = new Date().toISOString();
        });
      }

      const content = JSON.stringify(rows, null, 2);
      await this.writeFileAtomic(content);
    } catch (error) {
      throw PortsError.fromFileError(error, this.filePath);
    }
  }

  fileExists(): boolean {
    try {
      return fs.existsSync(this.filePath);
    } catch (error) {
      return false;
    }
  }

  getFilePath(): string {
    return this.filePath;
  }

  async backup(): Promise<string> {
    try {
      if (!this.fileExists()) {
        throw new PortsError(
          "Cannot backup non-existent file",
          null,
          "FILE_NOT_FOUND"
        );
      }

      const backupPath = `${this.filePath}.backup.${Date.now()}`;
      const content = await this.readFile();
      await this.writeFile(backupPath, content);

      return backupPath;
    } catch (error) {
      throw PortsError.fromFileError(error, this.filePath);
    }
  }

  async restore(backupPath: string): Promise<void> {
    try {
      if (!fs.existsSync(backupPath)) {
        throw new PortsError(
          `Backup file not found: ${backupPath}`,
          null,
          "BACKUP_NOT_FOUND"
        );
      }

      const content = fs.readFileSync(backupPath, "utf-8");
      await this.writeFileAtomic(content);
    } catch (error) {
      throw PortsError.fromFileError(error, backupPath);
    }
  }

  private async readFile(): Promise<string> {
    try {
      return fs.readFileSync(this.filePath, "utf-8");
    } catch (error) {
      throw PortsError.fromFileError(error, this.filePath);
    }
  }

  private async writeFile(filePath: string, content: string): Promise<void> {
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, content);
    } catch (error) {
      throw PortsError.fromFileError(error, filePath);
    }
  }

  private async writeFileAtomic(content: string): Promise<void> {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const tmp = path.join(
        dir,
        `.${path.basename(this.filePath)}.${process.pid}.tmp`
      );
      fs.writeFileSync(tmp, content);
      fs.renameSync(tmp, this.filePath);
    } catch (error) {
      throw PortsError.fromFileError(error, this.filePath);
    }
  }

  // Method to get file statistics
  getFileStats(): fs.Stats | null {
    try {
      return fs.statSync(this.filePath);
    } catch (error) {
      return null;
    }
  }

  // Method to validate file format without loading
  async validateFileFormat(): Promise<{ valid: boolean; errors: string[] }> {
    try {
      if (!this.fileExists()) {
        return { valid: false, errors: ["File does not exist"] };
      }

      const raw = await this.readFile();
      let parsed: unknown;

      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        return { valid: false, errors: ["Invalid JSON format"] };
      }

      if (!Array.isArray(parsed)) {
        return { valid: false, errors: ["Expected array format"] };
      }

      const errors: string[] = [];

      for (let i = 0; i < parsed.length; i++) {
        const row = parsed[i] as any;

        if (!row.Service || typeof row.Service !== "string") {
          errors.push(`Row ${i}: Missing or invalid Service field`);
        }

        if (!Number.isFinite(row["Internal Port"])) {
          errors.push(`Row ${i}: Missing or invalid Internal Port field`);
        }

        if (!Number.isFinite(row["Host Port"])) {
          errors.push(`Row ${i}: Missing or invalid Host Port field`);
        }
      }

      return { valid: errors.length === 0, errors };
    } catch (error) {
      return { valid: false, errors: [String(error)] };
    }
  }
}
