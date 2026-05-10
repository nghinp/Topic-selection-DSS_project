import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpHeaders } from '@angular/common/http';
import { NavbarComponent } from '../../components/navbar/navbar.component';
import { TopicGenerationService } from '../../services/topic-generation.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-topic-generation',
  standalone: true,
  imports: [CommonModule, FormsModule, NavbarComponent],
  templateUrl: './topic-generation.component.html',
  styleUrls: ['./topic-generation.component.scss']
})
export class TopicGenerationComponent implements OnInit {
  currentStep = 1;
  loadingConfig = true;
  generating = false;
  result: any = null;
  error: string | null = null;

  formData = {
    major: '',
    technical_specialization: '',
    application_direction: '',
    skills: [] as string[],
    thesis_type: '',
    feature_tags: [] as string[],
    exclude_keywords: ''
  };

  expandedGroupStep2: string | null = null;
  expandedGroupStep3: string | null = null;
  saving = false;
  saved = false;

  constructor(
    public auth: AuthService,
    public genService: TopicGenerationService
  ) { }

  ngOnInit() {
    this.genService.loadConfig().subscribe({
      next: () => {
        this.normalizeDependentSelections();
        this.loadingConfig = false;
      },
      error: () => {
        this.error = "Failed to load generation configuration.";
        this.loadingConfig = false;
      }
    });
  }

  get config() { return this.genService.config; }

  getSpecializationGroups() {
    return this.genService.getSpecializationGroups(this.formData.major);
  }

  onMajorChange(nextMajor: string) {
    const changed = this.formData.major !== nextMajor;
    this.formData.major = nextMajor;

    if (!changed) return;

    this.formData.technical_specialization = '';
    this.formData.application_direction = '';
    this.formData.skills = [];
    this.formData.feature_tags = [];
    this.expandedGroupStep2 = null;
    this.expandedGroupStep3 = null;
  }

  onSpecializationChange(nextSpecialization: string) {
    const changed = this.formData.technical_specialization !== nextSpecialization;
    this.formData.technical_specialization = nextSpecialization;

    if (!changed) return;

    this.formData.skills = [];
    this.formData.feature_tags = [];

    if (this.formData.application_direction && !this.isCurrentDirectionValid()) {
      this.formData.application_direction = '';
      this.expandedGroupStep3 = null;
    }
  }

  getSkills() {
    return this.genService.getSkills(this.formData.technical_specialization);
  }

  toggleSkill(skillId: string) {
    const idx = this.formData.skills.indexOf(skillId);
    if (idx > -1) {
      this.formData.skills.splice(idx, 1);
    } else {
      this.formData.skills.push(skillId);
    }
  }

  getFeatureTags() {
    return this.config?.featureTags || [];
  }

  isFeatureTagDisabled(tagId: string): boolean {
    return this.formData.feature_tags.length >= 3 && !this.formData.feature_tags.includes(tagId);
  }

  toggleFeatureTag(tagId: string) {
    const idx = this.formData.feature_tags.indexOf(tagId);
    if (idx > -1) {
      this.formData.feature_tags.splice(idx, 1);
      return;
    }
    if (this.formData.feature_tags.length < 3) {
      this.formData.feature_tags.push(tagId);
    }
  }

  getFeatureTagLabels(): string[] {
    const tags = this.getFeatureTags();
    return this.formData.feature_tags.map((id) => {
      const tag = tags.find((item: any) => item.id === id);
      return tag ? tag.label : id;
    });
  }

  isStepValid(step: number): boolean {
    switch (step) {
      case 1: return !!this.formData.major;
      case 2: return this.isCurrentSpecializationValid();
      case 3: return this.isCurrentSpecializationValid() && this.isCurrentDirectionValid();
      case 4: return true;
      case 5: return !!this.formData.thesis_type;
      case 6: return true;
      case 7: return true;
      case 8: return true;
      default: return false;
    }
  }

  nextStep() {
    if (this.isStepValid(this.currentStep)) {
      if (this.currentStep === 7) {
        this.currentStep = 8;
        this.submit();
      } else {
        this.currentStep++;
      }
    }
  }

  prevStep() {
    if (this.currentStep > 1 && this.currentStep < 8) {
      this.currentStep--;
    }
  }

  hasReviewData(): boolean {
    return this.isStepValid(1) && this.isStepValid(2) && this.isStepValid(3) && this.isStepValid(5);
  }

  backToReview() {
    this.error = null;
    this.generating = false;
    this.currentStep = this.hasReviewData() ? 7 : 1;
  }

  isCurrentSpecializationValid(): boolean {
    if (!this.formData.technical_specialization) return false;
    return this.getSpecializationGroups().some((group: any) =>
      group.options.some((option: any) => option.id === this.formData.technical_specialization)
    );
  }

  getAvailableDirectionGroups() {
    return this.genService.getAvailableDirectionGroups(this.formData.technical_specialization);
  }

  isCurrentDirectionValid(): boolean {
    if (!this.config?.step3 || !this.formData.application_direction) return false;
    const selectedGroup = this.config.step3.groups.find((group: any) =>
      group.options.some((option: any) => option.id === this.formData.application_direction)
    );
    return !!selectedGroup && this.genService.isStep3GroupAllowed(selectedGroup, this.formData.technical_specialization);
  }

  getSpecLabel(): string {
    return this.genService.getLabelById('step2', this.formData.technical_specialization);
  }

  getDirLabel(): string {
    return this.genService.getLabelById('step3', this.formData.application_direction);
  }

  getSkillLabels(): string[] {
    const list = this.getSkills();
    return this.formData.skills.map(id => {
      const s = list.find((opt: any) => opt.id === id);
      return s ? s.label : id;
    });
  }

  toggleGroupStep2(groupId: string) {
    this.expandedGroupStep2 = this.expandedGroupStep2 === groupId ? null : groupId;
  }

  toggleGroupStep3(groupId: string, group?: any) {
    if (group && !this.genService.isStep3GroupAllowed(group, this.formData.technical_specialization)) return;
    this.expandedGroupStep3 = this.expandedGroupStep3 === groupId ? null : groupId;
  }

  reset() {
    this.currentStep = 1;
    this.result = null;
    this.error = null;
    this.saved = false;
    this.saving = false;
    this.formData = {
      major: '',
      technical_specialization: '',
      application_direction: '',
      skills: [],
      thesis_type: '',
      feature_tags: [],
      exclude_keywords: ''
    };
  }

  private normalizeDependentSelections() {
    if (!this.isCurrentSpecializationValid()) {
      this.formData.technical_specialization = '';
      this.formData.application_direction = '';
      this.formData.skills = [];
      this.expandedGroupStep2 = null;
      this.expandedGroupStep3 = null;
      return;
    }

    if (!this.isCurrentDirectionValid()) {
      this.formData.application_direction = '';
      this.expandedGroupStep3 = null;
    }

    const availableSkillIds = new Set(this.getSkills().map((skill: any) => skill.id));
    this.formData.skills = this.formData.skills.filter((skillId) => availableSkillIds.has(skillId));
  }

  submit() {
    this.normalizeDependentSelections();
    this.generating = true;
    this.error = null;
    this.saved = false;

    const payload = {
      ...this.formData,
      exclude_keywords: this.formData.exclude_keywords.split(',').map(s => s.trim()).filter(s => s),
    };

    this.genService.generate(payload).subscribe({
      next: (res: any) => {
        this.generating = false;
        if (res.error) {
          this.error = res.error;
          this.currentStep = this.hasReviewData() ? 7 : 1;
        } else {
          this.result = res;
        }
      },
      error: (err) => {
        this.generating = false;
        this.error = err?.error?.error || "An error occurred while generating the topic.";
        this.currentStep = this.hasReviewData() ? 7 : 1;
      }
    });
  }

  private get authHeaders(): HttpHeaders {
    const token = this.auth.token || localStorage.getItem('authToken');
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  saveTopic() {
    if (!this.auth.isAuthed()) {
      alert("Please login to save the topic to your profile.");
      return;
    }
    this.saving = true;
    const reviewData = {
      major: this.formData.major,
      specialization: this.getSpecLabel(),
      direction: this.getDirLabel(),
      thesis_type: this.formData.thesis_type,
      feature_tags: this.getFeatureTagLabels().join(', '),
      exclude_keywords: this.formData.exclude_keywords,
      skills: this.getSkillLabels().join(', ')
    };

    this.genService.saveTopic(this.result.best_topic, reviewData, this.authHeaders).subscribe({
      next: () => {
        this.saving = false;
        this.saved = true;
      },
      error: () => {
        this.saving = false;
        alert("Failed to save topic.");
      }
    });
  }
}
