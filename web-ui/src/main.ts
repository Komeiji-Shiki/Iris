import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import './styles/main.css'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('./views/ChatView.vue') },
    { path: '/deploy', component: () => import('./views/DeployView.vue') },
  ],
})

const app = createApp(App)
app.use(router)
app.mount('#app')
