import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter } from 'react-router';

import HomePage from '@/pages/HomePage';
import MenuPage from '@/pages/MenuPage';

import { RouteErrorBoundary } from './RouteErrorBoundary';
import StudentLayout from './layouts/StudentLayout';

// Landing and menu load eagerly; other pages are fetched on demand.
const CheckoutPage = lazy(() => import('@/pages/CheckoutPage'));
const OrdersPage = lazy(() => import('@/pages/OrdersPage'));
const OrderReceiptPage = lazy(() => import('@/pages/OrderReceiptPage'));
const AboutPage = lazy(() => import('@/pages/AboutPage'));
const TermsPage = lazy(() => import('@/pages/TermsPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

// The admin panel is a separate bundle: students never download it.
const AdminLayout = lazy(() => import('./layouts/AdminLayout'));
const AdminLoginPage = lazy(() => import('@/pages/admin/AdminLoginPage'));
const AdminDashboardPage = lazy(() => import('@/pages/admin/AdminDashboardPage'));
const AdminQueuePage = lazy(() => import('@/pages/admin/AdminQueuePage'));
const AdminOrdersPage = lazy(() => import('@/pages/admin/AdminOrdersPage'));
const AdminOrderDetailPage = lazy(() => import('@/pages/admin/AdminOrderDetailPage'));
const AdminMenuPage = lazy(() => import('@/pages/admin/AdminMenuPage'));
const AdminSettingsPage = lazy(() => import('@/pages/admin/AdminSettingsPage'));

function PageSuspense({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div
          className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground"
          role="status"
        >
          Loading…
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

function AdminSuspense({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div
          className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground"
          role="status"
        >
          Loading…
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <StudentLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'menu', element: <MenuPage /> },
      {
        path: 'checkout',
        element: (
          <PageSuspense>
            <CheckoutPage />
          </PageSuspense>
        ),
      },
      {
        path: 'orders',
        element: (
          <PageSuspense>
            <OrdersPage />
          </PageSuspense>
        ),
      },
      {
        path: 'orders/:orderId',
        element: (
          <PageSuspense>
            <OrderReceiptPage />
          </PageSuspense>
        ),
      },
      {
        path: 'about',
        element: (
          <PageSuspense>
            <AboutPage />
          </PageSuspense>
        ),
      },
      {
        path: 'terms',
        element: (
          <PageSuspense>
            <TermsPage />
          </PageSuspense>
        ),
      },
      {
        path: '*',
        element: (
          <PageSuspense>
            <NotFoundPage />
          </PageSuspense>
        ),
      },
    ],
  },
  {
    path: '/admin/login',
    errorElement: <RouteErrorBoundary />,
    element: (
      <AdminSuspense>
        <AdminLoginPage />
      </AdminSuspense>
    ),
  },
  {
    path: '/admin',
    errorElement: <RouteErrorBoundary />,
    element: (
      <AdminSuspense>
        <AdminLayout />
      </AdminSuspense>
    ),
    children: [
      { index: true, element: <AdminDashboardPage /> },
      { path: 'queue', element: <AdminQueuePage /> },
      { path: 'orders', element: <AdminOrdersPage /> },
      { path: 'orders/:orderId', element: <AdminOrderDetailPage /> },
      { path: 'menu', element: <AdminMenuPage /> },
      { path: 'settings', element: <AdminSettingsPage /> },
    ],
  },
]);
