import { describe, expect, it } from "vitest";
import {
  hasOpenSwarmVersionFixtures,
  OPEN_SWARM_COMPAT_MANIFEST,
  OPEN_SWARM_PY_PYPROJECT,
  OPEN_SWARM_TS_PACKAGE_JSON,
} from "./open-swarm-paths.js";
import {
  readCompatManifest,
  readOpenSwarmPyVersion,
  readOpenSwarmTsVersion,
} from "./open-swarm-versions.js";

const hasFixtures = hasOpenSwarmVersionFixtures;

describe.skipIf(!hasFixtures)(
  "Smoke sync: open-swarm kernel client semver",
  () => {
    it("matches pinned versions in integration/open-swarm-compat.json", async () => {
      const [tsVersion, pyVersion, manifest] = await Promise.all([
        readOpenSwarmTsVersion(OPEN_SWARM_TS_PACKAGE_JSON),
        readOpenSwarmPyVersion(OPEN_SWARM_PY_PYPROJECT),
        readCompatManifest(OPEN_SWARM_COMPAT_MANIFEST),
      ]);

      expect(
        tsVersion,
        `@sgrs/kernel-client in open repo (${tsVersion}) must match integration/open-swarm-compat.json kernelClient.typescript (${manifest.kernelClient.typescript})`,
      ).toBe(manifest.kernelClient.typescript);
      expect(
        pyVersion,
        `sgrs-kernel-client in open repo (${pyVersion}) must match integration/open-swarm-compat.json kernelClient.python (${manifest.kernelClient.python})`,
      ).toBe(manifest.kernelClient.python);
    });

    it("keeps @sgrs/kernel-client and sgrs-kernel-client on the same semver when manifest pins align", async () => {
      const [tsVersion, pyVersion, manifest] = await Promise.all([
        readOpenSwarmTsVersion(OPEN_SWARM_TS_PACKAGE_JSON),
        readOpenSwarmPyVersion(OPEN_SWARM_PY_PYPROJECT),
        readCompatManifest(OPEN_SWARM_COMPAT_MANIFEST),
      ]);

      const { typescript: pinnedTs, python: pinnedPy } = manifest.kernelClient;
      if (pinnedTs !== pinnedPy) {
        return;
      }

      expect(
        tsVersion,
        "open-governed-swarm-of-agents TS and Python kernel clients must share the same semver (see docs/release-versioning.md)",
      ).toBe(pyVersion);
    });
  },
);
