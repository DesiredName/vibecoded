import { createRouter, createWebHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('../pages/HomePage.vue'),
  },
  {
    path: '/games/:id',
    component: () => import('../pages/GamePage.vue'),
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});
