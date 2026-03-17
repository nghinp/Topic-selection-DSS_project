import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { LoginComponent } from './pages/login/login.component';
import { AccountComponent } from './pages/account/account.component';
import { RegisterComponent } from './pages/register/register.component';
import { ExploreComponent } from './pages/explore/explore.component';
import { AboutComponent } from './pages/about/about.component';
import { AdminComponent } from './pages/admin/admin.component';
import { SearchComponent } from './pages/search/search.component';
import { TopicDetailComponent } from './pages/topic-detail/topic-detail.component';
import { PrivacyPolicyComponent } from './pages/privacy-policy/privacy-policy.component';
import { GuidesComponent } from './pages/guides/guides.component';
import { StudyFieldQuizComponent } from './pages/quiz/study-field-quiz/study-field-quiz.component';
import { CareerInterestsComponent } from './pages/quiz/career-interests/career-interests.component';
import { InitialIdeasComponent } from './pages/quiz/initial-ideas/initial-ideas.component';
import { SubmitComponent } from './pages/quiz/submit/submit.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'study-field-quiz', component: StudyFieldQuizComponent },
  { path: 'study-field-quiz/thesis-type-addtion', redirectTo: 'study-field-quiz/step-2', pathMatch: 'full' },
  { path: 'study-field-quiz/career-interests', component: CareerInterestsComponent },
  { path: 'study-field-quiz/step-2', component: InitialIdeasComponent },
  { path: 'study-field-quiz/initial-ideas', redirectTo: 'study-field-quiz/step-2', pathMatch: 'full' },
  { path: 'study-field-quiz/submit', component: SubmitComponent },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'account', component: AccountComponent },
  { path: 'explore', component: ExploreComponent },
  { path: 'about', component: AboutComponent },
  { path: 'privacy-policy', component: PrivacyPolicyComponent },
  { path: 'guides', component: GuidesComponent },
  { path: 'search', component: SearchComponent },
  { path: 'topics/:id', component: TopicDetailComponent },
  { path: 'admin', component: AdminComponent },
  { path: '**', redirectTo: '' }
];
