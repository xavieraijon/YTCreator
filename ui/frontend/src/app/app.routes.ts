import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./paginas/inicio/inicio').then((m) => m.Inicio), title: 'Inicio · YTCreator' },
  { path: 'asistente', loadComponent: () => import('./paginas/asistente/asistente').then((m) => m.Asistente), title: 'Asistente · YTCreator' },
  { path: 'canales', loadComponent: () => import('./paginas/canales/canales').then((m) => m.Canales), title: 'Canales · YTCreator' },
  { path: 'canales/:slug', loadComponent: () => import('./paginas/canal/canal').then((m) => m.CanalPagina), title: 'Canal · YTCreator' },
  { path: 'videos/:id', loadComponent: () => import('./paginas/video/video').then((m) => m.VideoPagina), title: 'Vídeo · YTCreator' },
  { path: 'tareas', loadComponent: () => import('./paginas/tareas/tareas').then((m) => m.TareasPagina), title: 'Tareas · YTCreator' },
  { path: 'ajustes', loadComponent: () => import('./paginas/ajustes/ajustes').then((m) => m.Ajustes),
    loadChildren: () => import('./paginas/ajustes/rutas').then((m) => m.RUTAS_AJUSTES) },
  { path: '**', redirectTo: '' },
];
