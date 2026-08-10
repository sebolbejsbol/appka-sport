import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, Image } from 'react-native';

import { TextField } from '@/components/text-field';
import { Brand, Radius } from '@/constants/theme';
import { t } from '@/i18n';
import { parseLocalDateTime, toDateInput, toTimeInput } from '@/lib/datetime';
import { pickImageFromLibrary } from '@/lib/pick-image';
import { TEAM_SPORTS, formatTeamSport, type TeamSport } from '@/lib/sports';
import type { NewTournament, Tournament, TournamentSport } from '@/lib/tournaments';

export type TournamentFormValue = {
  name: string;
  description: string;
  sport: TournamentSport;
  logoUri: string | null;
  logoMime: string;
  logoBase64: string | null;
  eventDate: string;
  startTime: string;
  endTime: string;
  regOpenDate: string;
  regOpenTime: string;
  regCloseDate: string;
  regCloseTime: string;
  locationName: string;
  address: string;
  city: string;
  contactInfo: string;
  maxTeams: string;
  minTeams: string;
  playersPerTeam: string;
  substitutesPerTeam: string;
  requiresApproval: boolean;
  pointsWin: string;
  pointsDraw: string;
  pointsLoss: string;
  allowDraws: boolean;
  groupNames: string[];
};

export function emptyTournamentFormValue(): TournamentFormValue {
  const now = new Date();
  return {
    name: '',
    description: '',
    sport: 'basketball',
    logoUri: null,
    logoMime: 'image/jpeg',
    logoBase64: null,
    eventDate: toDateInput(now),
    startTime: toTimeInput(now),
    endTime: '',
    regOpenDate: '',
    regOpenTime: '',
    regCloseDate: toDateInput(now),
    regCloseTime: toTimeInput(now),
    locationName: '',
    address: '',
    city: '',
    contactInfo: '',
    maxTeams: '8',
    minTeams: '2',
    playersPerTeam: '5',
    substitutesPerTeam: '0',
    requiresApproval: false,
    pointsWin: '3',
    pointsDraw: '1',
    pointsLoss: '0',
    allowDraws: true,
    groupNames: [''],
  };
}

function splitIso(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  return { date: toDateInput(d), time: toTimeInput(d) };
}

export function tournamentToFormValue(tournament: Tournament): TournamentFormValue {
  const opens = splitIso(tournament.registration_opens_at);
  const closes = splitIso(tournament.registration_closes_at);
  return {
    name: tournament.name,
    description: tournament.description ?? '',
    sport: tournament.sport,
    logoUri: tournament.logo_url,
    logoMime: 'image/jpeg',
    logoBase64: null,
    eventDate: tournament.event_date,
    startTime: tournament.start_time.slice(0, 5),
    endTime: tournament.end_time?.slice(0, 5) ?? '',
    regOpenDate: opens.date,
    regOpenTime: opens.time,
    regCloseDate: closes.date,
    regCloseTime: closes.time,
    locationName: tournament.location_name ?? '',
    address: tournament.address ?? '',
    city: tournament.city ?? '',
    contactInfo: tournament.contact_info ?? '',
    maxTeams: String(tournament.max_teams),
    minTeams: String(tournament.min_teams),
    playersPerTeam: String(tournament.players_per_team),
    substitutesPerTeam: String(tournament.substitutes_per_team),
    requiresApproval: tournament.requires_approval,
    pointsWin: String(tournament.points_win),
    pointsDraw: String(tournament.points_draw),
    pointsLoss: String(tournament.points_loss),
    allowDraws: tournament.allow_draws,
    groupNames: tournament.groups.length > 0 ? tournament.groups.map((g) => g.name) : [''],
  };
}

function toInt(raw: string): number {
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) ? n : NaN;
}

export function validateTournamentForm(v: TournamentFormValue): string | null {
  if (v.name.trim().length < 3 || v.name.trim().length > 100) return t('tournamentForm.errName');
  if (!(TEAM_SPORTS as readonly string[]).includes(v.sport)) return t('tournamentForm.errSport');
  if (!parseLocalDateTime(v.eventDate, v.startTime)) return t('tournamentForm.errDate');
  if (v.endTime.trim() && !parseLocalDateTime(v.eventDate, v.endTime)) return t('tournamentForm.errTime');

  if (!v.regCloseDate.trim() || !v.regCloseTime.trim()) return t('tournamentForm.errRegistrationWindow');
  const closesIso = parseLocalDateTime(v.regCloseDate, v.regCloseTime);
  if (!closesIso) return t('tournamentForm.errRegistrationWindow');

  let opensIso: string | null = null;
  if (v.regOpenDate.trim() || v.regOpenTime.trim()) {
    opensIso = parseLocalDateTime(v.regOpenDate, v.regOpenTime);
    if (!opensIso) return t('tournamentForm.errRegistrationWindow');
    if (opensIso >= closesIso) return t('tournamentForm.errRegistrationWindow');
  }

  const maxTeams = toInt(v.maxTeams);
  if (!Number.isFinite(maxTeams) || maxTeams < 2 || maxTeams > 128) return t('tournamentForm.errMaxTeams');
  const minTeams = toInt(v.minTeams);
  if (!Number.isFinite(minTeams) || minTeams < 2 || minTeams > maxTeams) return t('tournamentForm.errMinTeams');
  const playersPerTeam = toInt(v.playersPerTeam);
  if (!Number.isFinite(playersPerTeam) || playersPerTeam < 1 || playersPerTeam > 30)
    return t('tournamentForm.errPlayersPerTeam');
  const substitutes = toInt(v.substitutesPerTeam);
  if (!Number.isFinite(substitutes) || substitutes < 0 || substitutes > 15)
    return t('tournamentForm.errSubstitutes');

  const groups = v.groupNames.map((g) => g.trim()).filter(Boolean);
  if (groups.length < 1 || groups.length > 16) return t('tournamentForm.errGroups');
  if (groups.some((g) => g.length > 40)) return t('tournamentForm.errGroupNames');
  if (new Set(groups).size !== groups.length) return t('tournamentForm.errGroupDuplicate');

  return null;
}

export function tournamentFormValueToInput(v: TournamentFormValue): NewTournament {
  const startsAt = parseLocalDateTime(v.eventDate, v.startTime)!;
  const closesAt = parseLocalDateTime(v.regCloseDate, v.regCloseTime)!;
  const opensAt =
    v.regOpenDate.trim() || v.regOpenTime.trim()
      ? parseLocalDateTime(v.regOpenDate, v.regOpenTime)
      : null;

  return {
    name: v.name.trim(),
    description: v.description.trim() || null,
    logoUrl: v.logoUri,
    sport: v.sport,
    eventDate: v.eventDate.trim(),
    startTime: v.startTime.trim(),
    endTime: v.endTime.trim() || null,
    registrationOpensAt: opensAt,
    registrationClosesAt: closesAt,
    locationName: v.locationName.trim() || null,
    address: v.address.trim() || null,
    city: v.city.trim() || null,
    latitude: null,
    longitude: null,
    contactInfo: v.contactInfo.trim() || null,
    maxTeams: toInt(v.maxTeams),
    minTeams: toInt(v.minTeams),
    playersPerTeam: toInt(v.playersPerTeam),
    substitutesPerTeam: toInt(v.substitutesPerTeam),
    requiresApproval: v.requiresApproval,
    pointsWin: toInt(v.pointsWin),
    pointsDraw: toInt(v.pointsDraw),
    pointsLoss: toInt(v.pointsLoss),
    allowDraws: v.allowDraws,
    groupNames: v.groupNames.map((g) => g.trim()).filter(Boolean),
  };
}

type Props = {
  value: TournamentFormValue;
  onChange: (patch: Partial<TournamentFormValue>) => void;
  disabled?: boolean;
};

export function TournamentForm({ value, onChange, disabled }: Props) {
  const [busyLogo, setBusyLogo] = useState(false);

  async function pickLogo() {
    if (disabled) return;
    setBusyLogo(true);
    const picked = await pickImageFromLibrary();
    setBusyLogo(false);
    if (!picked) return;
    onChange({ logoUri: picked.uri, logoMime: picked.mimeType, logoBase64: picked.base64 ?? null });
  }

  function setGroup(index: number, name: string) {
    const next = [...value.groupNames];
    next[index] = name;
    onChange({ groupNames: next });
  }

  function addGroup() {
    if (value.groupNames.length >= 16) return;
    onChange({ groupNames: [...value.groupNames, ''] });
  }

  function removeGroup(index: number) {
    if (value.groupNames.length <= 1) return;
    onChange({ groupNames: value.groupNames.filter((_, i) => i !== index) });
  }

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>{t('tournamentForm.sectionBasic')}</Text>

      <TextField
        label={t('tournamentForm.name')}
        value={value.name}
        onChangeText={(name) => onChange({ name })}
        editable={!disabled}
      />
      <TextField
        label={t('tournamentForm.description')}
        value={value.description}
        onChangeText={(description) => onChange({ description })}
        editable={!disabled}
        multiline
      />

      <Text style={styles.label}>{t('tournamentForm.sport')}</Text>
      <View style={styles.chipsRow}>
        {(TEAM_SPORTS as readonly TeamSport[]).map((sport) => {
          const active = value.sport === sport;
          return (
            <Pressable
              key={sport}
              disabled={disabled}
              onPress={() => onChange({ sport })}
              style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {formatTeamSport(sport)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>{t('tournamentForm.logoLabel')}</Text>
      <View style={styles.logoRow}>
        {value.logoUri ? <Image source={{ uri: value.logoUri }} style={styles.logo} /> : null}
        <Pressable disabled={disabled || busyLogo} onPress={pickLogo} style={styles.secondaryBtn}>
          <Text style={styles.secondaryBtnText}>{t('tournamentForm.pickLogo')}</Text>
        </Pressable>
      </View>

      <View style={styles.row}>
        <View style={styles.flex1}>
          <TextField
            label={t('tournamentForm.eventDate')}
            value={value.eventDate}
            onChangeText={(eventDate) => onChange({ eventDate })}
            placeholder={t('tournamentForm.eventDatePlaceholder')}
            editable={!disabled}
          />
        </View>
        <View style={styles.flex1}>
          <TextField
            label={t('tournamentForm.startTime')}
            value={value.startTime}
            onChangeText={(startTime) => onChange({ startTime })}
            placeholder={t('tournamentForm.timePlaceholder')}
            editable={!disabled}
          />
        </View>
        <View style={styles.flex1}>
          <TextField
            label={t('tournamentForm.endTime')}
            value={value.endTime}
            onChangeText={(endTime) => onChange({ endTime })}
            placeholder={t('tournamentForm.timePlaceholder')}
            editable={!disabled}
          />
        </View>
      </View>

      <Text style={styles.label}>{t('tournamentForm.registrationOpens')}</Text>
      <View style={styles.row}>
        <View style={styles.flex1}>
          <TextField
            label={t('tournamentForm.dateLabel')}
            value={value.regOpenDate}
            onChangeText={(regOpenDate) => onChange({ regOpenDate })}
            placeholder={t('tournamentForm.eventDatePlaceholder')}
            editable={!disabled}
          />
        </View>
        <View style={styles.flex1}>
          <TextField
            label={t('tournamentForm.timeLabel')}
            value={value.regOpenTime}
            onChangeText={(regOpenTime) => onChange({ regOpenTime })}
            placeholder={t('tournamentForm.timePlaceholder')}
            editable={!disabled}
          />
        </View>
      </View>

      <Text style={styles.label}>{t('tournamentForm.registrationCloses')}</Text>
      <View style={styles.row}>
        <View style={styles.flex1}>
          <TextField
            label={t('tournamentForm.dateLabel')}
            value={value.regCloseDate}
            onChangeText={(regCloseDate) => onChange({ regCloseDate })}
            placeholder={t('tournamentForm.eventDatePlaceholder')}
            editable={!disabled}
          />
        </View>
        <View style={styles.flex1}>
          <TextField
            label={t('tournamentForm.timeLabel')}
            value={value.regCloseTime}
            onChangeText={(regCloseTime) => onChange({ regCloseTime })}
            placeholder={t('tournamentForm.timePlaceholder')}
            editable={!disabled}
          />
        </View>
      </View>

      <TextField
        label={t('tournamentForm.locationName')}
        value={value.locationName}
        onChangeText={(locationName) => onChange({ locationName })}
        editable={!disabled}
      />
      <TextField
        label={t('tournamentForm.address')}
        value={value.address}
        onChangeText={(address) => onChange({ address })}
        editable={!disabled}
      />
      <TextField
        label={t('tournamentForm.city')}
        value={value.city}
        onChangeText={(city) => onChange({ city })}
        editable={!disabled}
      />
      <TextField
        label={t('tournamentForm.contactInfo')}
        value={value.contactInfo}
        onChangeText={(contactInfo) => onChange({ contactInfo })}
        editable={!disabled}
      />

      <Text style={styles.sectionTitle}>{t('tournamentForm.sectionConfig')}</Text>

      <View style={styles.row}>
        <View style={styles.flex1}>
          <TextField
            label={t('tournamentForm.maxTeams')}
            value={value.maxTeams}
            onChangeText={(maxTeams) => onChange({ maxTeams })}
            keyboardType="numeric"
            editable={!disabled}
          />
        </View>
        <View style={styles.flex1}>
          <TextField
            label={t('tournamentForm.minTeams')}
            value={value.minTeams}
            onChangeText={(minTeams) => onChange({ minTeams })}
            keyboardType="numeric"
            editable={!disabled}
          />
        </View>
      </View>
      <View style={styles.row}>
        <View style={styles.flex1}>
          <TextField
            label={t('tournamentForm.playersPerTeam')}
            value={value.playersPerTeam}
            onChangeText={(playersPerTeam) => onChange({ playersPerTeam })}
            keyboardType="numeric"
            editable={!disabled}
          />
        </View>
        <View style={styles.flex1}>
          <TextField
            label={t('tournamentForm.substitutesPerTeam')}
            value={value.substitutesPerTeam}
            onChangeText={(substitutesPerTeam) => onChange({ substitutesPerTeam })}
            keyboardType="numeric"
            editable={!disabled}
          />
        </View>
      </View>

      <ToggleRow
        label={t('tournamentForm.requiresApproval')}
        value={value.requiresApproval}
        onChange={(requiresApproval) => onChange({ requiresApproval })}
        disabled={disabled}
      />

      <View style={styles.row}>
        <View style={styles.flex1}>
          <TextField
            label={t('tournamentForm.pointsWin')}
            value={value.pointsWin}
            onChangeText={(pointsWin) => onChange({ pointsWin })}
            keyboardType="numeric"
            editable={!disabled}
          />
        </View>
        <View style={styles.flex1}>
          <TextField
            label={t('tournamentForm.pointsDraw')}
            value={value.pointsDraw}
            onChangeText={(pointsDraw) => onChange({ pointsDraw })}
            keyboardType="numeric"
            editable={!disabled}
          />
        </View>
        <View style={styles.flex1}>
          <TextField
            label={t('tournamentForm.pointsLoss')}
            value={value.pointsLoss}
            onChangeText={(pointsLoss) => onChange({ pointsLoss })}
            keyboardType="numeric"
            editable={!disabled}
          />
        </View>
      </View>

      <ToggleRow
        label={t('tournamentForm.allowDraws')}
        value={value.allowDraws}
        onChange={(allowDraws) => onChange({ allowDraws })}
        disabled={disabled}
      />

      <Text style={styles.sectionTitle}>{t('tournamentForm.sectionGroups')}</Text>
      {value.groupNames.map((name, index) => (
        <View key={index} style={styles.groupRow}>
          <TextInput
            style={styles.groupInput}
            value={name}
            onChangeText={(text) => setGroup(index, text)}
            placeholder={t('tournamentForm.groupPlaceholder')}
            placeholderTextColor={Brand.textMuted}
            editable={!disabled}
          />
          <Pressable
            disabled={disabled || value.groupNames.length <= 1}
            onPress={() => removeGroup(index)}
            style={styles.removeGroupBtn}>
            <Text style={styles.removeGroupText}>{t('tournamentForm.removeGroup')}</Text>
          </Pressable>
        </View>
      ))}
      <Pressable disabled={disabled} onPress={addGroup} style={styles.secondaryBtn}>
        <Text style={styles.secondaryBtnText}>{t('tournamentForm.addGroup')}</Text>
      </Pressable>
    </View>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chipsRow}>
        <Pressable disabled={disabled} onPress={() => onChange(true)} style={[styles.chip, value && styles.chipActive]}>
          <Text style={[styles.chipText, value && styles.chipTextActive]}>{t('tournamentForm.yes')}</Text>
        </Pressable>
        <Pressable disabled={disabled} onPress={() => onChange(false)} style={[styles.chip, !value && styles.chipActive]}>
          <Text style={[styles.chipText, !value && styles.chipTextActive]}>{t('tournamentForm.no')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Brand.textPrimary,
    marginTop: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.15,
    color: Brand.textSecondary,
    textTransform: 'uppercase',
  },
  row: { flexDirection: 'row', gap: 10 },
  flex1: { flex: 1 },
  toggleRow: { gap: 8 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  chipActive: { backgroundColor: Brand.primary, borderColor: Brand.primary },
  chipText: { fontSize: 14, fontWeight: '600', color: Brand.textPrimary },
  chipTextActive: { color: Brand.primaryText },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 56, height: 56, borderRadius: Radius.md, backgroundColor: Brand.surface },
  secondaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Brand.borderStrong,
    backgroundColor: Brand.surface,
    alignSelf: 'flex-start',
  },
  secondaryBtnText: { fontSize: 14, fontWeight: '600', color: Brand.textPrimary },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupInput: {
    flex: 1,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
    borderRadius: Radius.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: Brand.textPrimary,
  },
  removeGroupBtn: { paddingHorizontal: 10, paddingVertical: 10 },
  removeGroupText: { fontSize: 13, fontWeight: '600', color: Brand.danger },
});
