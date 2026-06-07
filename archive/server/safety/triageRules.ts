export interface TriageRules {
  checkEmergency: (vitals: any) => boolean;
}

export const triageRulesEngine: TriageRules = {
  checkEmergency: (vitals: any) => {
    // Basic rules engine example
    if (vitals.spO2 && vitals.spO2 < 90) return true;
    if (vitals.chestPain) return true;
    return false;
  }
};
