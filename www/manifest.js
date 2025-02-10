// Dynamically get the base URL to ensure file paths work in localhost and also when uploaded to Amplify
const baseURL = window.location.origin; 

mapshaper.manifest = {
  files: [
    `${baseURL}/mapshaper/data/bendigoNetwork.zip`
  ],
  quick_view: true,
  commands: ""
};