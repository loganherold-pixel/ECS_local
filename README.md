# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npm start
   ```

   ECS uses `scripts/start-expo-safe.mjs` to launch Expo with dependency validation disabled. That avoids Expo CLI startup doctor fetch failures such as `Body is unusable: Body has already been read` when the native module version endpoint or cache misbehaves.

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

## ECS Vehicle Trail System

This repository now includes an initial monorepo-style scaffold for the ECS Vehicle Trail System:

- `apps/api` - Python 3.12 FastAPI service with SQLAlchemy 2.x, Alembic, Pydantic v2, GeoAlchemy2, and pytest.
- `apps/web` - Next.js and TypeScript frontend with an API health display.
- `packages/shared` - Shared trail access labels and routeability constants.
- `infra` - Local PostGIS initialization files.

Local setup:

```bash
cp .env.example .env
make install
make dev
```

Useful commands:

```bash
make test
make lint
make format
make migrate
```

The local stack starts PostGIS, runs the FastAPI API at `http://localhost:8000`, and starts the web app at `http://localhost:3000`. The API exposes `/healthz` and `/v1/system/info`.

Architecture notes live in `docs/architecture.md`. The central rule is that ECS owns vehicle trail legality, access checks, routeability, closures, and source confidence. Mapbox is used for basemap, presentation, and on-road support only; it is not the legal trail authority.
