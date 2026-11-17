import { GuildType } from '../types';

const GUILD_RELEVANT_MODULES: Record<string, GuildType[]> = {
  did_protocol: ['technology'],
  open_commerce: ['commercial', 'technology'],
  barcode_scanner: ['commercial'],
  payroll: ['services', 'technology', 'contracting', 'commercial'] // در دسترس تمامی اصناف، کارگاه‌ها و دفاتر فنی دارای پرسنل و بیمه
};

export const isModuleRelevantToGuild = (
  moduleId: string,
  guildType?: GuildType
): boolean => {
  if (!guildType) return true;
  const relevantGuilds = GUILD_RELEVANT_MODULES[moduleId];
  return !relevantGuilds || relevantGuilds.includes(guildType);
};
