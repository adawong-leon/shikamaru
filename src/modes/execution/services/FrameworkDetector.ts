import fs from "fs";
import path from "path";

export interface FrameworkInfo {
  type: "frontend" | "backend" | "fullstack";
  framework: string;
  version?: string;
  startupCommand: string;
  installCommand?: string;
  buildCommand?: string;
  port?: number;
  healthCheck?: string;
}

export interface FrameworkConfig {
  name: string;
  type: "frontend" | "backend" | "fullstack";
  patterns: string[];
  startupCommands: {
    [key: string]: string;
  };
  installCommands?: {
    [key: string]: string;
  };
  buildCommands?: {
    [key: string]: string;
  };
  defaultPort?: number;
  healthCheck?: string;
}

export class FrameworkDetector {
  private frameworks: FrameworkConfig[] = [
    // Node.js/JavaScript frameworks
    {
      name: "Node.js",
      type: "backend",
      patterns: ["package.json"],
      startupCommands: {
        "npm run start": "npm run start",
        "npm run dev": "npm run dev",
        "npm run start:dev": "npm run start:dev",
        node: "node index.js",
        nodemon: "nodemon index.js",
      },
      installCommands: {
        npm: "npm install",
        yarn: "yarn install",
        pnpm: "pnpm install",
      },
      defaultPort: 3000,
      healthCheck: "/health",
    },
    {
      name: "Angular",
      type: "frontend",
      patterns: ["angular.json", "package.json"],
      startupCommands: {
        "ng serve": "ng serve",
        "npm run start": "npm run start",
        "npm run dev": "npm run dev",
      },
      installCommands: {
        npm: "npm install",
        yarn: "yarn install",
      },
      buildCommands: {
        "ng build": "ng build",
        "npm run build": "npm run build",
      },
      defaultPort: 4200,
    },
    {
      name: "React",
      type: "frontend",
      patterns: ["package.json"],
      startupCommands: {
        "npm start": "npm start",
        "npm run dev": "npm run dev",
        "yarn start": "yarn start",
        "yarn dev": "yarn dev",
      },
      installCommands: {
        npm: "npm install",
        yarn: "yarn install",
      },
      buildCommands: {
        "npm run build": "npm run build",
        "yarn build": "yarn build",
      },
      defaultPort: 3000,
    },
    {
      name: "Vue.js",
      type: "frontend",
      patterns: ["package.json", "vue.config.js"],
      startupCommands: {
        "npm run serve": "npm run serve",
        "npm run dev": "npm run dev",
        "yarn serve": "yarn serve",
      },
      installCommands: {
        npm: "npm install",
        yarn: "yarn install",
      },
      buildCommands: {
        "npm run build": "npm run build",
        "yarn build": "yarn build",
      },
      defaultPort: 8080,
    },
    // .NET frameworks
    {
      name: ".NET Core/5/6",
      type: "backend",
      patterns: ["*.csproj", "*.sln", "Program.cs"],
      startupCommands: {
        "dotnet run": "dotnet run",
        "dotnet watch": "dotnet watch run",
      },
      installCommands: {
        "dotnet restore": "dotnet restore",
      },
      buildCommands: {
        "dotnet build": "dotnet build",
        "dotnet publish": "dotnet publish",
      },
      defaultPort: 5000,
      healthCheck: "/health",
    },
    {
      name: ".NET Framework",
      type: "backend",
      patterns: ["*.csproj", "*.sln", "Web.config"],
      startupCommands: {
        "dotnet run": "dotnet run",
        iis: "start iis",
      },
      installCommands: {
        "nuget restore": "nuget restore",
      },
      buildCommands: {
        msbuild: "msbuild",
        "dotnet build": "dotnet build",
      },
      defaultPort: 5000,
    },
    // Java frameworks
    {
      name: "Spring Boot",
      type: "backend",
      patterns: [
        "pom.xml",
        "build.gradle",
        "application.properties",
        "application.yml",
      ],
      startupCommands: {
        "mvn spring-boot:run": "mvn spring-boot:run",
        "gradle bootRun": "gradle bootRun",
        "java -jar": "java -jar target/*.jar",
      },
      installCommands: {
        "mvn install": "mvn install",
        "gradle build": "gradle build",
      },
      buildCommands: {
        "mvn clean package": "mvn clean package",
        "gradle build": "gradle build",
      },
      defaultPort: 8080,
      healthCheck: "/actuator/health",
    },
    {
      name: "Maven",
      type: "backend",
      patterns: ["pom.xml"],
      startupCommands: {
        "mvn exec:java": "mvn exec:java",
        "mvn spring-boot:run": "mvn spring-boot:run",
      },
      installCommands: {
        "mvn install": "mvn install",
      },
      buildCommands: {
        "mvn clean package": "mvn clean package",
      },
      defaultPort: 8080,
    },
    {
      name: "Gradle",
      type: "backend",
      patterns: ["build.gradle", "build.gradle.kts"],
      startupCommands: {
        "gradle run": "gradle run",
        "gradle bootRun": "gradle bootRun",
      },
      installCommands: {
        "gradle build": "gradle build",
      },
      buildCommands: {
        "gradle build": "gradle build",
      },
      defaultPort: 8080,
    },
    // Python frameworks
    {
      name: "Django",
      type: "backend",
      patterns: ["manage.py", "requirements.txt", "pyproject.toml"],
      startupCommands: {
        "python manage.py runserver": "python manage.py runserver",
        "django-admin runserver": "django-admin runserver",
        "python -m django runserver": "python -m django runserver",
      },
      installCommands: {
        "pip install": "pip install -r requirements.txt",
        "poetry install": "poetry install",
      },
      buildCommands: {
        "python manage.py collectstatic": "python manage.py collectstatic",
      },
      defaultPort: 8000,
      healthCheck: "/health",
    },
    {
      name: "Flask",
      type: "backend",
      patterns: ["app.py", "requirements.txt", "pyproject.toml"],
      startupCommands: {
        "python app.py": "python app.py",
        "flask run": "flask run",
        "python -m flask run": "python -m flask run",
      },
      installCommands: {
        "pip install": "pip install -r requirements.txt",
        "poetry install": "poetry install",
      },
      defaultPort: 5000,
      healthCheck: "/health",
    },
    {
      name: "FastAPI",
      type: "backend",
      patterns: ["main.py", "requirements.txt", "pyproject.toml"],
      startupCommands: {
        "uvicorn main:app": "uvicorn main:app --reload",
        "python -m uvicorn": "python -m uvicorn main:app --reload",
        "fastapi run": "fastapi run main:app --reload",
      },
      installCommands: {
        "pip install": "pip install -r requirements.txt",
        "poetry install": "poetry install",
      },
      defaultPort: 8000,
      healthCheck: "/docs",
    },
    {
      name: "Poetry",
      type: "backend",
      patterns: ["pyproject.toml"],
      startupCommands: {
        "poetry run": "poetry run python main.py",
        "poetry run uvicorn": "poetry run uvicorn main:app --reload",
      },
      installCommands: {
        "poetry install": "poetry install",
      },
      buildCommands: {
        "poetry build": "poetry build",
      },
      defaultPort: 8000,
    },
    // Go frameworks
    {
      name: "Go",
      type: "backend",
      patterns: ["go.mod", "main.go"],
      startupCommands: {
        "go run": "go run main.go",
        "go run .": "go run .",
      },
      installCommands: {
        "go mod tidy": "go mod tidy",
        "go mod download": "go mod download",
      },
      buildCommands: {
        "go build": "go build",
        "go build -o": "go build -o app",
      },
      defaultPort: 8080,
      healthCheck: "/health",
    },
    // PHP frameworks
    {
      name: "Laravel",
      type: "backend",
      patterns: ["artisan", "composer.json"],
      startupCommands: {
        "php artisan serve": "php artisan serve",
        "php -S": "php -S localhost:8000 -t public",
      },
      installCommands: {
        "composer install": "composer install",
      },
      buildCommands: {
        "php artisan build": "php artisan build",
      },
      defaultPort: 8000,
      healthCheck: "/health",
    },
    {
      name: "Symfony",
      type: "backend",
      patterns: ["composer.json", "config/"],
      startupCommands: {
        "symfony server:start": "symfony server:start",
        "php -S": "php -S localhost:8000 -t public",
      },
      installCommands: {
        "composer install": "composer install",
      },
      buildCommands: {
        "composer build": "composer build",
      },
      defaultPort: 8000,
    },
    // Ruby frameworks
    {
      name: "Ruby on Rails",
      type: "backend",
      patterns: ["Gemfile", "config/routes.rb"],
      startupCommands: {
        "rails server": "rails server",
        "bundle exec rails s": "bundle exec rails s",
      },
      installCommands: {
        "bundle install": "bundle install",
      },
      buildCommands: {
        "rails assets:precompile": "rails assets:precompile",
      },
      defaultPort: 3000,
      healthCheck: "/health",
    },
    // Rust frameworks
    {
      name: "Rust",
      type: "backend",
      patterns: ["Cargo.toml", "src/main.rs"],
      startupCommands: {
        "cargo run": "cargo run",
        "cargo watch": "cargo watch -x run",
      },
      installCommands: {
        "cargo build": "cargo build",
      },
      buildCommands: {
        "cargo build --release": "cargo build --release",
      },
      defaultPort: 8080,
      healthCheck: "/health",
    },
  ];

  async detectFramework(repoPath: string): Promise<FrameworkInfo | null> {
    try {
      const detectedFrameworks: FrameworkConfig[] = [];

      // Check for framework patterns
      for (const framework of this.frameworks) {
        for (const pattern of framework.patterns) {
          if (this.fileExists(repoPath, pattern)) {
            detectedFrameworks.push(framework);
            break;
          }
        }
      }

      if (detectedFrameworks.length === 0) {
        return null;
      }

      // Get the most specific framework (first match)
      const framework = detectedFrameworks[0];

      // Determine the best startup command
      const startupCommand = await this.determineStartupCommand(
        repoPath,
        framework
      );

      console.log(
        `[DEBUG] Framework: ${framework.name}, Startup Command: ${startupCommand}`
      );

      // Get version if available
      const version = await this.getFrameworkVersion(repoPath, framework);

      return {
        type: framework.type,
        framework: framework.name,
        version,
        startupCommand,
        installCommand: await this.determineInstallCommand(repoPath, framework),
        buildCommand: await this.determineBuildCommand(repoPath, framework),
        port: framework.defaultPort,
        healthCheck: framework.healthCheck,
      };
    } catch (error) {
      console.log(
        `[DEBUG] Error detecting framework for ${repoPath}: ${error}`
      );
      return null;
    }
  }

  private fileExists(repoPath: string, pattern: string): boolean {
    if (pattern.includes("*")) {
      // Handle glob patterns
      const files = fs.readdirSync(repoPath);
      const regex = new RegExp(pattern.replace("*", ".*"));
      return files.some((file) => regex.test(file));
    } else {
      return fs.existsSync(path.join(repoPath, pattern));
    }
  }

  private async determineStartupCommand(
    repoPath: string,
    framework: FrameworkConfig
  ): Promise<string> {
    // Check for custom startup scripts in package.json (for Node.js projects)
    if (
      framework.name === "Node.js" ||
      framework.name === "Angular" ||
      framework.name === "React" ||
      framework.name === "Vue.js"
    ) {
      const packageJsonPath = path.join(repoPath, "package.json");
      if (fs.existsSync(packageJsonPath)) {
        try {
          const packageJson = JSON.parse(
            fs.readFileSync(packageJsonPath, "utf8")
          );
          const scripts = packageJson.scripts || {};

          // Priority order for startup commands
          const priorityCommands = ["start", "dev", "serve", "start:dev"];
          for (const cmd of priorityCommands) {
            if (scripts[cmd]) {
              return `npm run ${cmd}`;
            }
          }
        } catch (error) {
          console.log(`[DEBUG] Error reading package.json: ${error}`);
        }
      }
    }

    // Check for specific framework files
    if (
      framework.name === "Django" &&
      fs.existsSync(path.join(repoPath, "manage.py"))
    ) {
      return "python manage.py runserver";
    }

    if (
      framework.name === "Flask" &&
      fs.existsSync(path.join(repoPath, "app.py"))
    ) {
      return "python app.py";
    }

    if (
      framework.name === "FastAPI" &&
      fs.existsSync(path.join(repoPath, "main.py"))
    ) {
      return "uvicorn main:app --reload";
    }

    if (
      framework.name === "Spring Boot" &&
      fs.existsSync(path.join(repoPath, "pom.xml"))
    ) {
      return "mvn spring-boot:run";
    }

    if (
      framework.name === ".NET Core/5/6" &&
      (this.fileExists(repoPath, "*.csproj") ||
        fs.existsSync(path.join(repoPath, "Program.cs")))
    ) {
      // Check if this is a Docker Compose project
      const dockerComposeYml = path.join(repoPath, "docker-compose.yml");
      const dockerComposeYaml = path.join(repoPath, "docker-compose.yaml");
      const composeYml = path.join(repoPath, "compose.yml");
      const composeYaml = path.join(repoPath, "compose.yaml");

      console.log(`[DEBUG] Checking Docker Compose files:`);
      console.log(
        `[DEBUG]   ${dockerComposeYml}: ${fs.existsSync(dockerComposeYml)}`
      );
      console.log(
        `[DEBUG]   ${dockerComposeYaml}: ${fs.existsSync(dockerComposeYaml)}`
      );
      console.log(`[DEBUG]   ${composeYml}: ${fs.existsSync(composeYml)}`);
      console.log(`[DEBUG]   ${composeYaml}: ${fs.existsSync(composeYaml)}`);

      const hasDockerCompose =
        fs.existsSync(dockerComposeYml) ||
        fs.existsSync(dockerComposeYaml) ||
        fs.existsSync(composeYml) ||
        fs.existsSync(composeYaml);

      if (hasDockerCompose) {
        console.log(
          `[DEBUG] .NET project has Docker Compose, using: docker-compose up`
        );
        return "docker-compose up";
      }

      // Check for solution file first
      const solutionFiles = fs
        .readdirSync(repoPath)
        .filter((file) => file.endsWith(".sln"));
      if (solutionFiles.length > 0) {
        return `dotnet run --project ${solutionFiles[0]}`;
      }

      // Check for project files
      const projectFiles = fs
        .readdirSync(repoPath)
        .filter((file) => file.endsWith(".csproj"));
      if (projectFiles.length > 0) {
        return `dotnet run --project ${projectFiles[0]}`;
      }

      return "dotnet run";
    }

    // Return the first available startup command
    return Object.values(framework.startupCommands)[0];
  }

  private async determineInstallCommand(
    repoPath: string,
    framework: FrameworkConfig
  ): Promise<string | undefined> {
    if (!framework.installCommands) {
      return undefined;
    }

    // Check for specific package managers
    if (
      framework.name === "Node.js" ||
      framework.name === "Angular" ||
      framework.name === "React" ||
      framework.name === "Vue.js"
    ) {
      if (fs.existsSync(path.join(repoPath, "yarn.lock"))) {
        return "yarn install";
      } else if (fs.existsSync(path.join(repoPath, "pnpm-lock.yaml"))) {
        return "pnpm install";
      } else {
        return "npm install";
      }
    }

    if (
      framework.name === "Python" ||
      framework.name === "Django" ||
      framework.name === "Flask" ||
      framework.name === "FastAPI"
    ) {
      if (fs.existsSync(path.join(repoPath, "pyproject.toml"))) {
        return "poetry install";
      } else if (fs.existsSync(path.join(repoPath, "requirements.txt"))) {
        return "pip install -r requirements.txt";
      }
    }

    if (
      framework.name === ".NET Core/5/6" ||
      framework.name === ".NET Framework"
    ) {
      // Check if this is a Docker Compose project
      const hasDockerCompose =
        fs.existsSync(path.join(repoPath, "docker-compose.yml")) ||
        fs.existsSync(path.join(repoPath, "docker-compose.yaml")) ||
        fs.existsSync(path.join(repoPath, "compose.yml")) ||
        fs.existsSync(path.join(repoPath, "compose.yaml"));

      if (hasDockerCompose) {
        return "docker-compose build";
      }

      // Check for solution file first
      const solutionFiles = fs
        .readdirSync(repoPath)
        .filter((file) => file.endsWith(".sln"));
      if (solutionFiles.length > 0) {
        return `dotnet restore ${solutionFiles[0]}`;
      }

      // Check for project files
      const projectFiles = fs
        .readdirSync(repoPath)
        .filter((file) => file.endsWith(".csproj"));
      if (projectFiles.length > 0) {
        return `dotnet restore ${projectFiles[0]}`;
      }

      return "dotnet restore";
    }

    if (framework.name === "Spring Boot" || framework.name === "Maven") {
      return "mvn install";
    }

    if (framework.name === "Gradle") {
      return "gradle build";
    }

    // Return the first available install command
    return Object.values(framework.installCommands)[0];
  }

  private async determineBuildCommand(
    repoPath: string,
    framework: FrameworkConfig
  ): Promise<string | undefined> {
    if (!framework.buildCommands) {
      return undefined;
    }

    // Check for specific build configurations
    if (
      framework.name === "Node.js" ||
      framework.name === "Angular" ||
      framework.name === "React" ||
      framework.name === "Vue.js"
    ) {
      const packageJsonPath = path.join(repoPath, "package.json");
      if (fs.existsSync(packageJsonPath)) {
        try {
          const packageJson = JSON.parse(
            fs.readFileSync(packageJsonPath, "utf8")
          );
          const scripts = packageJson.scripts || {};

          if (scripts.build) {
            return `npm run build`;
          }
        } catch (error) {
          console.log(`[DEBUG] Error reading package.json for build: ${error}`);
        }
      }
    }

    // Return the first available build command
    return Object.values(framework.buildCommands)[0];
  }

  private async getFrameworkVersion(
    repoPath: string,
    framework: FrameworkConfig
  ): Promise<string | undefined> {
    try {
      if (
        framework.name === "Node.js" ||
        framework.name === "Angular" ||
        framework.name === "React" ||
        framework.name === "Vue.js"
      ) {
        const packageJsonPath = path.join(repoPath, "package.json");
        if (fs.existsSync(packageJsonPath)) {
          const packageJson = JSON.parse(
            fs.readFileSync(packageJsonPath, "utf8")
          );
          return packageJson.version;
        }
      }

      if (framework.name === "Spring Boot") {
        const pomPath = path.join(repoPath, "pom.xml");
        if (fs.existsSync(pomPath)) {
          const pomContent = fs.readFileSync(pomPath, "utf8");
          const versionMatch = pomContent.match(/<version>([^<]+)<\/version>/);
          return versionMatch ? versionMatch[1] : undefined;
        }
      }

      if (framework.name === ".NET Core/5/6") {
        const csprojFiles = fs
          .readdirSync(repoPath)
          .filter((file) => file.endsWith(".csproj"));
        if (csprojFiles.length > 0) {
          const csprojPath = path.join(repoPath, csprojFiles[0]);
          const csprojContent = fs.readFileSync(csprojPath, "utf8");
          const versionMatch = csprojContent.match(
            /<TargetFramework>([^<]+)<\/TargetFramework>/
          );
          return versionMatch ? versionMatch[1] : undefined;
        }
      }

      if (
        framework.name === "Python" ||
        framework.name === "Django" ||
        framework.name === "Flask" ||
        framework.name === "FastAPI"
      ) {
        const pyprojectPath = path.join(repoPath, "pyproject.toml");
        if (fs.existsSync(pyprojectPath)) {
          const pyprojectContent = fs.readFileSync(pyprojectPath, "utf8");
          const versionMatch = pyprojectContent.match(
            /version\s*=\s*["']([^"']+)["']/
          );
          return versionMatch ? versionMatch[1] : undefined;
        }
      }
    } catch (error) {
      console.log(`[DEBUG] Error getting framework version: ${error}`);
    }

    return undefined;
  }

  getSupportedFrameworks(): string[] {
    return this.frameworks.map((f) => f.name);
  }

  getFrameworkConfig(name: string): FrameworkConfig | undefined {
    return this.frameworks.find((f) => f.name === name);
  }

  async checkCommandAvailability(command: string): Promise<boolean> {
    try {
      const { spawnSync } = await import("child_process");
      const result = spawnSync("which", [command], { stdio: "ignore" });
      return result.status === 0;
    } catch (error) {
      return false;
    }
  }

  getInstallationInstructions(framework: string): string {
    const instructions: { [key: string]: string } = {
      ".NET Core/5/6":
        "Install .NET SDK from https://dotnet.microsoft.com/download",
      ".NET Framework":
        "Install .NET Framework from https://dotnet.microsoft.com/download",
      "Spring Boot":
        "Install Java JDK and Maven from https://maven.apache.org/install.html",
      Maven:
        "Install Java JDK and Maven from https://maven.apache.org/install.html",
      Gradle: "Install Java JDK and Gradle from https://gradle.org/install/",
      Django: "Install Python and pip, then run: pip install django",
      Flask: "Install Python and pip, then run: pip install flask",
      FastAPI: "Install Python and pip, then run: pip install fastapi uvicorn",
      Go: "Install Go from https://golang.org/dl/",
      Laravel:
        "Install PHP and Composer from https://getcomposer.org/download/",
      Symfony:
        "Install PHP and Composer from https://getcomposer.org/download/",
      "Ruby on Rails":
        "Install Ruby and Bundler from https://rubyinstaller.org/",
      Rust: "Install Rust from https://rustup.rs/",
    };

    return instructions[framework] || `Install ${framework} runtime`;
  }
}
