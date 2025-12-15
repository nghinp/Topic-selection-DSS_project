import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { QuizComponent } from './pages/quiz/quiz.component';
import { ResultComponent } from './pages/result/result.component';
import { LoginComponent } from './pages/login/login.component';
import { AccountComponent } from './pages/account/account.component';
import { RegisterComponent } from './pages/register/register.component';
import { ExploreComponent } from './pages/explore/explore.component';
import { AboutComponent } from './pages/about/about.component';
import { AdminComponent } from './pages/admin/admin.component';
import { SearchComponent } from './pages/search/search.component';
import { TopicDetailComponent } from './pages/topic-detail/topic-detail.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'quiz', component: QuizComponent },
  { path: 'result/:id', component: ResultComponent },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'account', component: AccountComponent },
  { path: 'explore', component: ExploreComponent },
  { path: 'about', component: AboutComponent },
  { path: 'search', component: SearchComponent },
  { path: 'topics/:id', component: TopicDetailComponent },
  { path: 'admin', component: AdminComponent },
  { path: '**', redirectTo: '' }
];
