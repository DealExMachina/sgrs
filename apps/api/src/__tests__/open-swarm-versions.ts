import { readFile } from "node:fs/promises";

export type OpenSwarmCompatManifest = {
  kernelClient: {
    npm: string;
    pypi: string;
    typescript: string;
    python: string;
  };
};

export async function readOpenSwarmTsVersion(
  packageJsonPath: string,
): Promise<string> {
  const raw = await readFile(packageJsonPath, "utf8");
  const pkg = JSON.parse(raw) as { version?: string };
  if (!pkg.version) {
    throw new Error(`missing version in ${packageJsonPath}`);
  }
  return pkg.version;
}

export async function readOpenSwarmPyVersion(
  pyprojectPath: string,
): Promise<string> {
  const raw = await readFile(pyprojectPath, "utf8");
  const match = raw.match(/(?:^|\n)version\s*=\s*"([^"]+)"/);
  if (!match) {
    throw new Error(`missing version in ${pyprojectPath}`);
  }
  return match[1];
}

export async function readCompatManifest(
  manifestPath: string,
): Promise<OpenSwarmCompatManifest> {
  const raw = await readFile(manifestPath, "utf8");
  return JSON.parse(raw) as OpenSwarmCompatManifest;
}
