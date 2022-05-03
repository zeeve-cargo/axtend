## Description

<a href="http://www.typescriptlang.org" target="_blank">TypeScript</a> type definitions that can be used to decorate the <a href="https://www.npmjs.com/package/@axia/api" target="_blank">@axia/api</a>.

## Installation

```bash
npm i @axtend-network/api-augment
```

## Usage

Add to your codebase entry point before any imports from the API itself.

- `import '@axtend-network/api-augment'` - applies Axtend types and endpoint augmentation
- `import '@axtend-network/api-augment/moonriver'` - applies Moonriver types and endpoint augmentation
- `import '@axtend-network/api-augment/moonbase'` - applies Moonbase Alpha types and endpoint augmentation

## Docs

- <a href="https://axia.js.org/docs/api/examples/promise/typegen/" target="_blank">@axia/api</a> - TS type generation
- <a href="https://axia.js.org/docs/api/FAQ/#since-upgrading-to-the-7x-series-typescript-augmentation-is-missing" target="_blank">@axia/api</a> - Since upgrading to the 7.x series, TypeScript augmentation is missing
- <a href="https://axia.js.org/docs/api/start/typescript" target="_blank">@axia/api</a> - TypeScript interfaces
