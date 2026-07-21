# @sgrs/ui

Design tokens and shared utilities for SGRS Studio.

## Usage

```ts
// 1. Import tokens (CSS variables) at the root of your app
import "@sgrs/ui/tokens.css";

// 2. Use the Tailwind preset
import preset from "@sgrs/ui/tailwind-preset";
export default { presets: [preset], content: [...] };

// 3. Use classnames helper
import { cn } from "@sgrs/ui";
cn("bg-ink text-mist", condition && "border-graphite");
```

## License

MIT — see `LICENSE`.
