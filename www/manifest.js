// Dynamically get the base URL to ensure file paths work in localhost and also when uploaded to Amplify
const baseURL = window.location.origin; 

mapshaper.manifest = {
  files: [
    `${baseURL}/mapshaper/data/bendigoNetwork.zip`
  ],
  quick_view: true,
  commands: "-classify field=cycleway save-as=stroke colors='#d3d3d3,#3579b1,#ff7f00,#47a244,#e83034,#904b9b'"
};