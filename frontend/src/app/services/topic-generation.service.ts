import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { API_ENDPOINTS } from '../constants/api';

@Injectable({
  providedIn: 'root'
})
export class TopicGenerationService {
  public config: any = null;

  constructor(private http: HttpClient) {}

  loadConfig(): Observable<any> {
    return this.http.get(API_ENDPOINTS.topicGenerationConfig).pipe(
      tap(config => this.config = config)
    );
  }

  getSpecializationGroups(major: string) {
    if (!this.config?.step2 || !major) return [];
    const mapping: Record<string, string[]> = {
      'IT': ['web_software_platform_systems', 'cybersecurity_trust_systems', 'iot_embedded_edge_systems', 'blockchain_distributed_trust'],
      'CS': ['ai_intelligent_systems', 'data_science_analytics', 'computer_vision_multimedia', 'cybersecurity_trust_systems', 'hardware_architecture_fpga', 'graphics_games_vrar_hci', 'blockchain_distributed_trust', 'nlp_language_conversational_systems'],
      'DS': ['ai_intelligent_systems', 'data_science_analytics', 'computer_vision_multimedia', 'nlp_language_conversational_systems']
    };
    const allowed = mapping[major] || [];
    return this.config.step2.groups.filter((g: any) => allowed.includes(g.groupId));
  }

  getSkills(technicalSpecialization: string) {
    if (!this.config?.step4 || !technicalSpecialization) return [];
    const groupId = this.getGroupIdForSpecialization(technicalSpecialization);
    if (!groupId) return [];
    const skillSet = this.config.step4.skillSetsByStep2Group[groupId];
    return skillSet ? skillSet.options : [];
  }

  getGroupIdForSpecialization(specId: string): string | null {
    if (!this.config?.step2) return null;
    for (const group of this.config.step2.groups) {
      if (group.options.find((opt: any) => opt.id === specId)) {
        return group.groupId;
      }
    }
    return null;
  }

  isStep3GroupAllowed(directionGroup: any, selectedSpecialization: string): boolean {
    const s2Group = this.getGroupIdForSpecialization(selectedSpecialization);
    if (!s2Group || !directionGroup.allowed_step2_groups) return true;
    return directionGroup.allowed_step2_groups.includes(s2Group);
  }

  getAvailableDirectionGroups(selectedSpecialization: string) {
    if (!this.config?.step3) return [];
    return this.config.step3.groups.filter((group: any) => this.isStep3GroupAllowed(group, selectedSpecialization));
  }

  getLabelById(step: 'step2' | 'step3', id: string): string {
    if (!this.config?.[step] || !id) return '';
    for (const group of this.config[step].groups) {
      const opt = group.options.find((o: any) => o.id === id);
      if (opt) return opt.label;
    }
    return '';
  }

  generate(payload: any): Observable<any> {
    return this.http.post(API_ENDPOINTS.topicGenerationGenerate, payload);
  }

  saveTopic(title: string, reviewData: any, headers: HttpHeaders): Observable<any> {
    return this.http.post(API_ENDPOINTS.topicGenerationSave, {
      title,
      review_data: reviewData
    }, { headers });
  }
}
