import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { Login } from './pages/login/login';
import { Auth } from './core/auth/auth';

const requireSession: CanActivateFn = async (_route, state) => {
  const auth = inject(Auth);
  const router = inject(Router);

  if (await auth.restaurarSessao()) {
    return true;
  }

  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'dashboard',
  },
  {
    path: 'login',
    component: Login,
  },
  {
    path: 'dashboard',
    canActivate: [requireSession],
    loadComponent: () => import('./pages/dashboard/dashboard').then((page) => page.Dashboard),
  },
  {
    path: 'estoque',
    canActivate: [requireSession],
    loadComponent: () => import('./pages/estoque/estoque').then((page) => page.EstoquePage),
  },
  {
    path: 'caixa/:id',
    canActivate: [requireSession],
    loadComponent: () => import('./pages/caixa/caixa').then((page) => page.CaixaPage),
  },
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
