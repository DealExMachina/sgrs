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
    it("keeps @sgrs/kernel-client and sgrs-kernel-client on the same semver", async () => {
      const [tsVersion, pyVersion] = await Promise.all([
        readOpenSwarmTsVersion(OPEN_SWARM_TS_PACKAGE_JSON),
        readOpenSwarmPyVersion(OPEN_SWARM_PY_PYPROJECT),
      ]);

      expect(
        tsVersion,
        "open-governed-swarm-of-agents TS and Python kernel clients must share the same semver (see docs/release-versioning.md)",
      ).toBe(pyVersion);
    });

    it("matches the pinned version in integration/open-swarm-compat.json", async () => {
      const [tsVersion, pyVersion, manifest] = await Promise.all([
        readOpenSwarmTsVersion(OPEN_SWARM_TS_PACKAGE_JSON),
        readOpenSwarmPyVersion(OPEN_SWARM_PY_PYPROJECT),
        readCompatManifest(OPEN_SWARM_COMPAT_MANIFEST),
      ]);

      const expected = manifest.kernelClient.version;
      expect(tsVersion).toBe(expected);
      expect(pyVersion).toBe(expected);
    });
  },
);
