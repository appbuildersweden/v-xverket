/**
 * Texter som skiljer skolelevens panel från privatelevens.
 *
 * Skoleleven har en lärare och en klass. Privateleven studerar självständigt:
 * det finns ingen lärare som tilldelar något och ingen klass, så panelen får
 * inte tala om en lärare som eleven inte har. Sidorna är desamma och läser
 * samma databas — bara orden skiljer.
 *
 * Standard är skolelevens texter, så en sida som inte får någon panel behåller
 * exakt samma ord som förut.
 */
import { Panel } from './auth-types';

export interface StudentCopy {
  /** Sant när panelen är privatelevens. */
  privat: boolean;
  tasksSubtitle: string;
  tasksEmptyTitle: string;
  tasksEmptyDescription: string;
  feedbackTitle: string;
  feedbackFallback: string;
  submissionPlaceholder: string;
  submittedNotice: string;
  planningSubtitle: string;
  planningCalendarSubtitle: string;
  planningDayFilter: string;
  planningAssignedTitle: string;
  planningAssignedEmpty: string;
  planningXpNote: string;
  documentsSubtitle: string;
  documentsEmpty: string;
  progressNote: string;
  progressEmpty: string;
  subjectsEmpty: string;
  sharedDecksSubtitle: string;
  quizEmptyDescription: string;
  quizSharedSubtitle: string;
  quizNoQuestions: string;
}

const SKOLELEV: StudentCopy = {
  privat: false,
  tasksSubtitle: 'Uppgifter som din lärare har gett dig',
  tasksEmptyTitle: 'Inga uppgifter ännu',
  tasksEmptyDescription: 'När din lärare ger dig en uppgift visas den här.',
  feedbackTitle: 'Återkoppling från din lärare',
  feedbackFallback: 'Din lärare har tittat på uppgiften.',
  submissionPlaceholder: 'Skriv ditt svar eller en anteckning till läraren',
  submittedNotice: 'Svaret är inlämnat. Din lärare kan se det.',
  planningSubtitle: 'Det du ska göra — och det du själv planerat',
  planningCalendarSubtitle: 'Dina poster och det du fått av din lärare',
  planningDayFilter: 'från din lärare och',
  planningAssignedTitle: 'Från din lärare',
  planningAssignedEmpty: 'När din lärare ger dig en uppgift eller planering dyker den upp här.',
  planningXpNote:
    'Varje egen post som du bockar av ger 10 XP — en gång per post. Uppgifter från din lärare ger också 10 XP. XP:n låser upp Halloween-belöningarna.',
  documentsSubtitle: 'Material från din lärare och dina egna filer',
  documentsEmpty:
    'När din lärare delar material med dig, eller du laddar upp en egen fil, visas den här.',
  progressNote:
    'Elda visar bara din egen data. Det finns inget betygssystem här — prata med din lärare om du vill veta hur det går.',
  progressEmpty:
    'När du har fått uppgifter, gjort en provträning eller tjänat XP visas dina framsteg här.',
  subjectsEmpty: 'Ämnena visas när din lärare har gett dig en uppgift eller delat material med dig.',
  sharedDecksSubtitle: 'Material som läraren har delat',
  quizEmptyDescription:
    'Din lärare har inte delat någon övning. Du kan skapa en egen och träna på den.',
  quizSharedSubtitle: 'Från din lärare eller andra',
  quizNoQuestions: 'Din lärare har inte lagt till några frågor i den här övningen ännu.',
};

const PRIVAT: StudentCopy = {
  privat: true,
  tasksSubtitle: 'Egna studieaktiviteter och uppgifter som uttryckligen tilldelats dig',
  tasksEmptyTitle: 'Du har inga uppgifter just nu',
  tasksEmptyDescription: 'Dina egna studieaktiviteter lägger du upp under Min planering.',
  feedbackTitle: 'Återkoppling',
  feedbackFallback: 'Uppgiften har följts upp.',
  submissionPlaceholder: 'Skriv ditt svar eller en egen anteckning',
  submittedNotice: 'Svaret är sparat.',
  planningSubtitle: 'Dina studiepass och det du själv planerat',
  planningCalendarSubtitle: 'Dina egna poster',
  planningDayFilter: 'tilldelade dig och',
  planningAssignedTitle: 'Tilldelat dig',
  planningAssignedEmpty:
    'Inget har tilldelats dig. Dina egna studiepass lägger du upp under Mina egna poster.',
  planningXpNote:
    'Varje post du bockar av ger 10 XP — en gång per post. XP:n låser upp Halloween-belöningarna i trädgården.',
  documentsSubtitle: 'Ditt eget studiematerial',
  documentsEmpty: 'Ladda upp en egen fil så visas den här.',
  progressNote:
    'Elda visar bara din egen data. Framstegen räknas fram ur dina egna aktiviteter — det finns inget betygssystem här.',
  progressEmpty:
    'Det finns ännu ingen aktivitet att sammanställa. När du har skapat ett studiepass, gjort en provträning eller tjänat XP visas dina framsteg här.',
  subjectsEmpty: 'Ämnena visas när du har egna poster, uppgifter eller material.',
  sharedDecksSubtitle: 'Material som delats med dig',
  quizEmptyDescription: 'Ingen övning har delats med dig. Du kan skapa en egen och träna på den.',
  quizSharedSubtitle: 'Delade med dig',
  quizNoQuestions: 'Övningen har inga frågor ännu.',
};

export function studentCopy(panel: Panel): StudentCopy {
  return panel === 'privat' ? PRIVAT : SKOLELEV;
}

/** Sidans test-id: samma sida används av båda elevpanelerna. */
export function studentPageTestId(panel: Panel, page: string): string {
  return `page-${panel}-${page}`;
}
