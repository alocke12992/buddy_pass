import type { AppRouter } from '@buddy-pass/api/router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import superjson from 'superjson';
import './index.css';
import { AppShell } from '@/components/app/AppShell';
import { Toaster } from '@/components/ui/sonner';
import { TRPCProvider } from '@/lib/trpc';
import NotFoundPage from '@/pages/NotFoundPage';
import SignInPage from '@/pages/auth/SignInPage';
import SignUpPage from '@/pages/auth/SignUpPage';
import WelcomePage from '@/pages/auth/WelcomePage';
import FriendProfilePage from '@/pages/friends/FriendProfilePage';
import FriendsPage from '@/pages/friends/FriendsPage';
import HomePage from '@/pages/home/HomePage';
import FriendLandingPage from '@/pages/links/FriendLandingPage';
import ShareLandingPage from '@/pages/links/ShareLandingPage';
import LogPage from '@/pages/log/LogPage';
import OnboardingPage from '@/pages/onboarding/OnboardingPage';
import ProfilePage from '@/pages/profile/ProfilePage';
import SettingsPage from '@/pages/settings/SettingsPage';
import BuilderPage from '@/pages/workout/BuilderPage';
import LivePage from '@/pages/workout/LivePage';
import SummaryPage from '@/pages/workout/SummaryPage';
import WorkoutDetailPage from '@/pages/workout/WorkoutDetailPage';

const queryClient = new QueryClient();

const trpcClient = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: '/trpc', transformer: superjson })],
});

// Route map per FRONTEND.md §2: four tabs inside the shell; full-screen flows outside it.
const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/log', element: <LogPage /> },
      { path: '/friends', element: <FriendsPage /> },
      { path: '/friends/:id', element: <FriendProfilePage /> },
      { path: '/profile', element: <ProfilePage /> },
    ],
  },
  { path: '/workout/new', element: <BuilderPage /> },
  { path: '/workout/:id', element: <WorkoutDetailPage /> },
  { path: '/workout/:id/edit', element: <BuilderPage /> },
  { path: '/workout/:id/live', element: <LivePage /> },
  { path: '/workout/:id/summary', element: <SummaryPage /> },
  { path: '/share/:token', element: <ShareLandingPage /> },
  { path: '/friend/:token', element: <FriendLandingPage /> },
  { path: '/welcome', element: <WelcomePage /> },
  { path: '/sign-in', element: <SignInPage /> },
  { path: '/sign-up', element: <SignUpPage /> },
  { path: '/onboarding', element: <OnboardingPage /> },
  { path: '/settings', element: <SettingsPage /> },
  { path: '*', element: <NotFoundPage /> },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <RouterProvider router={router} />
        <Toaster />
      </TRPCProvider>
    </QueryClientProvider>
  </StrictMode>,
);
