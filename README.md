# Privy Auth `create-next-app` Starter

This is a template for integrating [**Privy Auth**](https://www.privy.io/) into a [NextJS](https://nextjs.org/) project. Check out the deployed app [here](https://create-next-app.privy.io/)!

This demo uses NextJS's [Pages Router](https://nextjs.org/docs/pages/building-your-application/routing). If you'd like to see an example using the [App Router](https://nextjs.org/docs/app), just change the branch of this repository to [`app-router`](https://github.com/privy-io/create-next-app/tree/app-router).

## Setup

1. Clone this repository and open it in your terminal.

```sh
git clone https://github.com/privy-io/create-next-app
```

2. Install the necessary dependencies (including [Privy Auth](https://www.npmjs.com/package/@privy-io/react-auth)) with `npm`.

```sh
npm i
```

3. Initialize your environment variables by copying the `.env.example` file to an `.env.local` file. Then, in `.env.local`, [paste your Privy App ID from the dashboard](https://docs.privy.io/guide/dashboard/api-keys).

```sh
# In your terminal, create .env.local from .env.example
cp .env.example .env.local

# Add your Privy App ID to .env.local
NEXT_PUBLIC_PRIVY_APP_ID=<your-privy-app-id>
```

## Building locally

In your project directory, run `npm run dev`. You can now visit http://localhost:3000 to see your app and login with Privy!

## Check out:

- `pages/_app.tsx` for how to use the `PrivyProvider` and initialize it with your Privy App ID
- `pages/index.tsx` for how to use the `usePrivy` hook and implement a simple `login` button
- `pages/dashboard.tsx` for how to use the `usePrivy` hook, fields like `ready`, `authenticated`, and `user`, and methods like `linkWallet` and `logout`

**Check out [our docs](https://docs.privy.io/) for more guidance around using Privy in your app!**

## Database Setup

### Supabase

This project uses Supabase as its database. Follow these steps to set up the database:

1. Make sure your environment variables are set in a `.env` file:

   ```
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_key
   ```

2. Install the required packages if they're not already installed:

   ```
   npm install dotenv
   ```

3. Run the migrations to create all necessary tables:
   ```
   npm run db:migrate
   ```

This will create all necessary tables in your Supabase database, including:

- User profiles
- Applications
- Enrollments
- Quests
- Activities

### Database Structure

The database contains the following main tables:

- `user_profiles`: Stores user information
- `applications`: Bootcamp applications
- `user_application_status`: Links users to their applications
- `bootcamp_enrollments`: User enrollments in bootcamps
- `user_activities`: User activity tracking
- `quests` and `quest_tasks`: Quest system

The database also includes views for easier data access:

- `user_applications_view`: Combines user_application_status with applications
- `user_enrollments_view`: Combines bootcamp_enrollments with cohorts
