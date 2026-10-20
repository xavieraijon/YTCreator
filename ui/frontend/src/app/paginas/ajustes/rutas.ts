import { Routes } from '@angular/router';

export const RUTAS_AJUSTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'servicios' },
  { path: 'servicios', loadComponent: () => import('./servicios').then((m) => m.AjustesServicios), title: 'Servicios · Ajustes · YTCreator' },
  { path: 'ia', loadComponent: () => import('./ia').then((m) => m.AjustesIA), title: 'IA · Ajustes · YTCreator' },
  { path: 'gasto', loadComponent: () => import('./gasto').then((m) => m.AjustesGasto), title: 'Gasto · Ajustes · YTCreator' },
  { path: 'equipo', loadComponent: () => import('./equipo').then((m) => m.AjustesEquipo), title: 'Este equipo · Ajustes · YTCreator' },
];
