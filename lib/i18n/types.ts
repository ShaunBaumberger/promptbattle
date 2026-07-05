import type { Round } from "@/lib/types/database";

/**
 * Shape every locale dictionary must implement. All values are plain strings
 * (with `{placeholder}` tokens resolved via `interpolate`) so translators can
 * edit the dictionary files without touching code — important for an
 * open-source project taking community translations.
 *
 * Kept in its own module (no "use client", no imports of dictionaries) to
 * avoid a circular import between dictionaries.ts and the per-locale files.
 */
export interface Dictionary {
  lang: {
    /** Accessible label for the language switcher. */
    switchLabel: string;
  };
  common: {
    loading: string;
  };
  /** Round names, keyed by the bracket round code. */
  rounds: Record<Round, string>;
  landing: {
    scanTitle: string;
    scanHint: string;
    codeNotFoundTitle: string;
    /** "{code}" */
    codeNotFoundText: string;
    finishedTitle: string;
    /** "{name}" */
    finishedText: string;
  };
  join: {
    nameLabel: string;
    joinButton: string;
    joining: string;
    errCodeMissing: string;
    errNameRequired: string;
    errNameTooLong: string;
    errLoadFailed: string;
    errInvalidCode: string;
    errFinished: string;
    /** "{msg}" */
    errFailed: string;
  };
  lobby: {
    sessionExpired: string;
    /** "{name}" */
    greeting: string;
    stayInApp: string;
    finishedBadge: string;
    finishedText: string;
    waitingBadge: string;
    waitingText: string;
    eliminatedBadge: string;
    eliminatedText: string;
    playerBadge: string;
    playerText: string;
    viewerBadge: string;
    viewerText: string;
  };
  play: {
    generateVideoOf: string;
    generateImageOf: string;
    videoPlaceholder: string;
    imagePlaceholder: string;
    tapToEnlarge: string;
    tapToClose: string;
    prepareReady: string;
    youSitLeft: string;
    youSitRight: string;
    /** "{name}" */
    versus: string;
    taskAppearsWhenHost: string;
    generatingTitle: string;
    generatingHint: string;
    wonTitle: string;
    advancedText: string;
    lostTitle: string;
    lostText: string;
    yourResult: string;
    generationFailed: string;
    yourPrompt: string;
    emptyPrompt: string;
    votingOnStage: string;
    /** Online-venue tournaments: link so remote players open the stage view. */
    watchStage: string;
  };
  vote: {
    votingLive: string;
    whoPromptedBetter: string;
    tapImageToWin: string;
    /** "{task}" */
    taskLabel: string;
    /** "{name}" */
    voteCastFor: string;
    canChangeVote: string;
    yourChoice: string;
    /** "{name}" */
    resultOf: string;
    noImage: string;
  };
  /** Projector / stage view. */
  stage: {
    loadingMatch: string;
    loadingBracket: string;
    loadingChampion: string;
    audioEnable: string;
    scanOrGoTo: string;
    personJoined: string;
    peopleJoined: string;
    /** "{count}" */
    playersSelected: string;
    /** "{round}", "{n}" */
    roundMatch: string;
    votingLive: string;
    champion: string;
    winner: string;
    finalVideosGenerating: string;
    /** "{name}" */
    videoNotReady: string;
    prepareReady: string;
    taskAppears: string;
    left: string;
    right: string;
    generateVideoOf: string;
    generateImageOf: string;
    referenceImage: string;
    reference: string;
    imagesGenerating: string;
    noImage: string;
    promptLabel: string;
    noPrompt: string;
    /** "{name}" */
    tournamentOver: string;
    /** "{name}" */
    runnerUp: string;
    status: {
      pending: string;
      preparing: string;
      live: string;
      locked: string;
      generating: string;
      reveal: string;
      voting: string;
      done: string;
    };
  };
  /** Host/admin console. */
  admin: {
    title: string;
    logout: string;
    cancel: string;
    back: string;
    /** Tournament status badge. */
    tStatus: { setup: string; live: string; finished: string };
    // dashboard
    createTournament: string;
    existingTournaments: string;
    noTournaments: string;
    code: string;
    /** "{count}" */
    playersN: string;
    // create form
    tournamentName: string;
    tournamentNamePlaceholder: string;
    mode: string;
    modeOpt2: string;
    modeOpt4: string;
    modeOpt8: string;
    modeOpt16: string;
    modeOpt32: string;
    modeOptTest: string;
    testModeHint: string;
    roundTimeSeconds: string;
    creating: string;
    createButton: string;
    // login
    hostLogin: string;
    loginSubtitle: string;
    hostPassword: string;
    loginButton: string;
    loggingIn: string;
    // delete dialog
    deleteTournament: string;
    deleteConfirmTitle: string;
    /** "{name}" */
    deleteConfirmBody: string;
    deleting: string;
    deleteFinal: string;
    // restart-match dialog
    restartMatch: string;
    restartConfirmTitle: string;
    restartConfirmBody: string;
    restarting: string;
    restartYes: string;
    matchRestarted: string;
    // tournament [id] page chrome
    joinCodeLabel: string;
    /** "{n}" */
    perRound: string;
    openStage: string;
    tasksHeading: string;
    duplicate: string;
    duplicateHint: string;
    copyTournament: string;
    dangerZone: string;
    dangerHint: string;
    // participants
    participants: string;
    /** "{total}", "{players}", "{viewers}" */
    participantsSummary: string;
    noParticipants: string;
    playerBadge: string;
    // start-bracket form
    startTournament: string;
    /** "{count}" */
    startTournamentHint: string;
    /** "{have}", "{need}" */
    participantsProgress: string;
    /** "{have}", "{need}" */
    tasksProgress: string;
    selectAndStart: string;
    startingBracket: string;
    tournamentStarted: string;
    // venue (onsite vs online tournaments)
    venue: string;
    venueOnsite: string;
    venueOnline: string;
    venueHint: string;
    // tier / plan surface
    premiumTag: string;
    planFreeInfo: string;
    /** "{n}", "{max}" */
    freeGamesLeft: string;
    /** "{usd}" */
    estCost: string;
    // Stripe pay-per-event upgrade
    upgradeTitle: string;
    upgradeDesc: string;
    paymentMethodsNote: string;
    /** "{price}" */
    upgradeButton: string;
    upgradeRedirecting: string;
    premiumBadge: string;
    upgradeSuccess: string;
    upgradeCancelled: string;
    upgradeHint: string;
    // shared
    save: string;
    saving: string;
    ok: string;
    starting: string;
    // settings
    settings: string;
    testModeBtn: string;
    liveModeBtn: string;
    testModeActive: string;
    liveModeActive: string;
    testModeDesc: string;
    liveModeDesc: string;
    playerCount: string;
    playerCountLockedHint: string;
    playerCountEditableHint: string;
    playerCountUpdated: string;
    defaultRoundTime: string;
    roundTimeUpdated: string;
    roundTimeAppliesHint: string;
    roundTimePerRound: string;
    /** "{seconds}" */
    roundTimeOptionalHint: string;
    roundTimeRangeError: string;
    standardWord: string;
    /** "{label}", "{value}" */
    roundOverrideSaved: string;
    // match-control — match status badge
    mStatus: {
      pending: string;
      preparing: string;
      live: string;
      locked: string;
      generating: string;
      reveal: string;
      voting: string;
      done: string;
    };
    loadingMatchStatus: string;
    matchControl: string;
    /** "{n}" */
    roundTimeLabel: string;
    skipGenLabel: string;
    skipGenDesc: string;
    nothingWritten: string;
    remainingLabel: string;
    lockEarly: string;
    locking: string;
    playVideos: string;
    /** "{name}" */
    videoOf: string;
    backToReveal: string;
    videosGenerating: string;
    startVoting: string;
    /** "{n}" */
    voteCountOne: string;
    /** "{n}" */
    voteCountMany: string;
    votesHidden: string;
    endVoting: string;
    ending: string;
    pickWinnerManual: string;
    skipsVoting: string;
    /** "{name}" */
    winnerLabel: string;
    backToBracket: string;
    switching: string;
    replayMatchTest: string;
    noActiveMatch: string;
    prepareMatch: string;
    preparingMatch: string;
    startMatch: string;
    matchPrepared: string;
    matchStarted: string;
    matchLocked: string;
    bracketShown: string;
    votingStarted: string;
    votingEnded: string;
    winnerSaved: string;
    // task-manager
    newTask: string;
    round: string;
    internalLabel: string;
    internalLabelPlaceholder: string;
    taskType: string;
    imageTask: string;
    textTask: string;
    videoTask: string;
    referenceImageLabel: string;
    chooseImage: string;
    imageFormats: string;
    remove: string;
    imageTaskHint: string;
    videoTaskLabel: string;
    textTaskLabel: string;
    videoTaskPlaceholder: string;
    textTaskPlaceholder: string;
    videoTaskHint: string;
    textTaskHint: string;
    savingTask: string;
    addTask: string;
    noTasksRound: string;
    videoBadge: string;
    textBadge: string;
    deleteBtn: string;
    // server-action error messages (returned to toasts). `{msg}` carries a
    // raw backend detail; other placeholders as noted.
    err: {
      tournamentNotFound: string;
      matchNotFound: string;
      taskNotFound: string;
      invalidRound: string;
      invalidTaskType: string;
      promptRequired: string;
      imageRequired: string;
      imageFormatError: string;
      imageTooLarge: string;
      /** "{max}" */
      textTooLong: string;
      /** "{msg}" */
      taskSaveFailed: string;
      /** "{msg}" */
      uploadFailed: string;
      playerCountInvalid: string;
      playerCountLockedError: string;
      tournamentAlreadyStarted: string;
      /** "{have}", "{need}" */
      notEnoughParticipants: string;
      /** "{label}", "{have}", "{need}" */
      notEnoughTasks: string;
      /** "{msg}" */
      playersMarkFailed: string;
      /** "{msg}" */
      matchesCreateFailed: string;
      /** "{msg}" */
      statusUpdateFailed: string;
      tournamentNotLive: string;
      currentMatchNotDone: string;
      noStartableMatch: string;
      matchNoTask: string;
      matchAlreadyPrepared: string;
      matchNotPrepared: string;
      /** "{msg}" */
      prepareFailed: string;
      /** "{msg}" */
      tournamentUpdateFailed: string;
      /** "{msg}" */
      matchStartFailed: string;
      replayTestOnly: string;
      playersMissing: string;
      noTasksForRound: string;
      /** "{msg}" */
      resetFailed: string;
      winnerAfterReveal: string;
      invalidWinner: string;
      /** "{msg}" */
      winnerSaveFailed: string;
      /** "{msg}" */
      bracketAdvanceFailed: string;
      /** "{msg}" */
      tournamentFinishFailed: string;
      restartOnlyActive: string;
      /** "{msg}" */
      restartFailed: string;
      matchNotLive: string;
      /** "{msg}" */
      lockFailed: string;
      votingAfterReveal: string;
      votingNotActive: string;
      /** "{msg}" */
      votingStartFailed: string;
      invalidChoice: string;
      playersCantVote: string;
      notParticipant: string;
      wrongPassword: string;
      noVotesTie: string;
      tie: string;
      playersNeedPremium: string;
      videoNeedsPremium: string;
      /** "{max}" */
      quotaExhausted: string;
      budgetPaused: string;
      /** "{msg}" */
      paymentInit: string;
      upgradeSetupOnly: string;
      alreadyPremium: string;
    };
  };
}
