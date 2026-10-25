"use strict";

(() => {
 
  const environment = "production";


  const environments = {
    localhost: {
      backendBaseUrl: "http://localhost:5230",
      clientId: "755573995790-m35f0tt91gvsvhhiuqto91nm539gsmju.apps.googleusercontent.com"
    },
    production: {
      backendBaseUrl: "https://keynestfdashboard-fydbd8fydmdubjhm.canadacentral-01.azurewebsites.net",
      clientId: "779255784206-r422l3egviqp4fhpvnh2o235v18m2rks.apps.googleusercontent.com"
    }
  };


  window.TIMESHEET_AUTH_CONFIG = {
    ...environments[environment],
    flutterDashboardUrl: "https://newflutterkeynest-aheucafef8cnhffz.canadacentral-01.azurewebsites.net/?demo=true#/next2",
    sessionPath: null,
    logoutPath: "/api/logout"
  };
})();
