import fs from "fs";
import path from "path";
import { EnvError } from "../errors/EnvError";

export class EnvFileWriter {
  async writeFile(filepath: string, content: string): Promise<void> {
    try {
      const dir = path.dirname(filepath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filepath, content);
    } catch (error) {
      throw EnvError.fromFileError(error, filepath);
    }
  }

  async writeFileAtomic(filepath: string, content: string): Promise<void> {
    try {
      const dir = path.dirname(filepath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const tmp = path.join(
        dir,
        `.${path.basename(filepath)}.${process.pid}.tmp`
      );
      fs.writeFileSync(tmp, content);
      fs.renameSync(tmp, filepath);
    } catch (error) {
      throw EnvError.fromFileError(error, filepath);
    }
  }

  fileExists(filepath: string): boolean {
    try {
      return fs.existsSync(filepath);
    } catch (error) {
      return false;
    }
  }

  async readFile(filepath: string): Promise<string> {
    try {
      return fs.readFileSync(filepath, "utf-8");
    } catch (error) {
      throw EnvError.fromFileError(error, filepath);
    }
  }

  async readFileIfExists(filepath: string): Promise<string | null> {
    if (!this.fileExists(filepath)) {
      return null;
    }
    return this.readFile(filepath);
  }

  async backupFile(filepath: string): Promise<string> {
    if (!this.fileExists(filepath)) {
      throw new EnvError(`Cannot backup non-existent file: ${filepath}`);
    }

    const backupPath = `${filepath}.backup.${Date.now()}`;
    const content = await this.readFile(filepath);
    await this.writeFile(backupPath, content);
    return backupPath;
  }

  async restoreFromBackup(
    backupPath: string,
    targetPath: string
  ): Promise<void> {
    if (!this.fileExists(backupPath)) {
      throw new EnvError(`Backup file not found: ${backupPath}`);
    }

    const content = await this.readFile(backupPath);
    await this.writeFileAtomic(targetPath, content);
  }

  getFileStats(filepath: string): fs.Stats | null {
    try {
      return fs.statSync(filepath);
    } catch (error) {
      return null;
    }
  }

  async ensureDirectory(dirpath: string): Promise<void> {
    try {
      if (!fs.existsSync(dirpath)) {
        fs.mkdirSync(dirpath, { recursive: true });
      }
    } catch (error) {
      throw EnvError.fromFileError(error, dirpath);
    }
  }
}
