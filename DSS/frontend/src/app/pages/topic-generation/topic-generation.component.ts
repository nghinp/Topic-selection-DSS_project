import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule, HttpHeaders } from '@angular/common/http';
import { API_ENDPOINTS } from '../../constants/api';
import { NavbarComponent } from '../../components/navbar/navbar.component';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-topic-generation',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule, NavbarComponent],
  templateUrl: './topic-generation.component.html',
  styleUrls: ['./topic-generation.component.scss']
})
export class TopicGenerationComponent implements OnInit {
  currentStep = 1;
  config: any = null;
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
    include_keywords: '',
    exclude_keywords: ''
  };

  keywordWarning = false;
  expandedGroupStep2: string | null = null;
  expandedGroupStep3: string | null = null;
  saving = false;
  saved = false;

  constructor(private http: HttpClient, public auth: AuthService) {}

  ngOnInit() {
    this.http.get(API_ENDPOINTS.topicGenerationConfig).subscribe({
      next: (data) => {
        this.config = data;
        this.normalizeDependentSelections();
        this.loadingConfig = false;
      },
      error: () => {
        this.error = "Failed to load generation configuration.";
        this.loadingConfig = false;
      }
    });
  }

  getSpecializationGroups() {
    if (!this.config?.step2) return [];
    const mapping: any = {
      'IT': ['web_software_platform_systems', 'cybersecurity_trust_systems', 'iot_embedded_edge_systems', 'blockchain_distributed_trust'],
      'CS': ['ai_intelligent_systems', 'data_science_analytics', 'computer_vision_multimedia', 'cybersecurity_trust_systems', 'hardware_architecture_fpga', 'graphics_games_vrar_hci', 'blockchain_distributed_trust', 'nlp_language_conversational_systems'],
      'DS': ['ai_intelligent_systems', 'data_science_analytics', 'computer_vision_multimedia', 'nlp_language_conversational_systems']
    };
    if (!this.formData.major) return [];
    const allowed = mapping[this.formData.major] || [];
    return this.config.step2.groups.filter((g: any) => allowed.includes(g.groupId));
  }

  onMajorChange(nextMajor: string) {
    const changed = this.formData.major !== nextMajor;
    this.formData.major = nextMajor;

    if (!changed) return;

    this.formData.technical_specialization = '';
    this.formData.application_direction = '';
    this.formData.skills = [];
    this.expandedGroupStep2 = null;
    this.expandedGroupStep3 = null;
  }

  onSpecializationChange(nextSpecialization: string) {
    const changed = this.formData.technical_specialization !== nextSpecialization;
    this.formData.technical_specialization = nextSpecialization;

    if (!changed) return;

    this.formData.skills = [];

    if (this.formData.application_direction && !this.isCurrentDirectionValid()) {
      this.formData.application_direction = '';
      this.expandedGroupStep3 = null;
    }
  }

  getSkills() {
    if (!this.config?.step4 || !this.formData.technical_specialization) return [];
    
    // Find groupId for selected specialization
    let selectedGroupId = null;
    for (const group of this.config.step2.groups) {
      if (group.options.find((opt: any) => opt.id === this.formData.technical_specialization)) {
        selectedGroupId = group.groupId;
        break;
      }
    }
    
    const skillSet = this.config.step4.skillSetsByStep2Group[selectedGroupId];
    return skillSet ? skillSet.options : [];
  }

  toggleSkill(skillId: string) {
    const idx = this.formData.skills.indexOf(skillId);
    if (idx > -1) {
      this.formData.skills.splice(idx, 1);
    } else {
      this.formData.skills.push(skillId);
    }
  }

  checkKeywordWarning() {
    const includes = this.formData.include_keywords.split(',').map(s => s.trim().toLowerCase()).filter(s => s);
    const excludes = this.formData.exclude_keywords.split(',').map(s => s.trim().toLowerCase()).filter(s => s);
    this.keywordWarning = includes.some(kw => excludes.includes(kw));
  }

  isStepValid(step: number): boolean {
    switch (step) {
      case 1: return !!this.formData.major;
      case 2: return this.isCurrentSpecializationValid();
      case 3: return this.isCurrentSpecializationValid() && this.isCurrentDirectionValid();
      case 4: return true; // skills are optional
      case 5: return !!this.formData.thesis_type;
      case 6: 
        this.checkKeywordWarning();
        return !this.keywordWarning;
      case 7: return true; // Review step
      case 8: return true;
      default: return false;
    }
  }

  nextStep() {
    if (this.isStepValid(this.currentStep)) {
      if (this.currentStep === 7) {
        // Submit
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


  getStep2GroupId(): string | null {
    if (!this.config?.step2 || !this.formData.technical_specialization) return null;
    for (const group of this.config.step2.groups) {
      if (group.options.find((o: any) => o.id === this.formData.technical_specialization)) {
        return group.groupId;
      }
    }
    return null;
  }

  isCurrentSpecializationValid(): boolean {
    if (!this.formData.technical_specialization) return false;
    return this.getSpecializationGroups().some((group: any) =>
      group.options.some((option: any) => option.id === this.formData.technical_specialization)
    );
  }

  isStep3GroupAllowed(group: any): boolean {
    const s2Group = this.getStep2GroupId();
    if (!s2Group || !group.allowed_step2_groups) return true;
    return group.allowed_step2_groups.includes(s2Group);
  }

  isCurrentDirectionValid(): boolean {
    if (!this.config?.step3 || !this.formData.application_direction) return false;

    const selectedGroup = this.config.step3.groups.find((group: any) =>
      group.options.some((option: any) => option.id === this.formData.application_direction)
    );

    if (!selectedGroup) return false;
    return this.isStep3GroupAllowed(selectedGroup);
  }

  getSpecLabel(): string {
    if (!this.config?.step2 || !this.formData.technical_specialization) return '';
    for (const group of this.config.step2.groups) {
      const opt = group.options.find((o: any) => o.id === this.formData.technical_specialization);
      if (opt) return opt.label;
    }
    return '';
  }

  getDirLabel(): string {
    if (!this.config?.step3 || !this.formData.application_direction) return '';
    for (const group of this.config.step3.groups) {
      const opt = group.options.find((o: any) => o.id === this.formData.application_direction);
      if (opt) return opt.label;
    }
    return '';
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
    if (group && !this.isStep3GroupAllowed(group)) return;
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
      include_keywords: '',
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
      include_keywords: this.formData.include_keywords.split(',').map(s => s.trim()).filter(s => s),
      exclude_keywords: this.formData.exclude_keywords.split(',').map(s => s.trim()).filter(s => s),
    };

    this.http.post(API_ENDPOINTS.topicGenerationGenerate, payload).subscribe({
      next: (res: any) => {
        this.generating = false;
        if (res.error) {
          this.error = res.error;
        } else {
          this.result = res;
        }
      },
      error: (err) => {
        this.generating = false;
        this.error = "An error occurred while generating the topic.";
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
        include_keywords: this.formData.include_keywords,
        exclude_keywords: this.formData.exclude_keywords,
        skills: this.getSkillLabels().join(', ')
    };
    
    this.http.post(API_ENDPOINTS.topicGenerationSave, {
        title: this.result.best_topic,
        review_data: reviewData
    }, { headers: this.authHeaders }).subscribe({
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
