const mongoose = require('mongoose')
const schema = mongoose.Schema

const userSchema = new schema({
    firstName:{
        type : String ,
    },
    lastName:{
        type : String ,
    },
    email:{
        type : String ,
        unique : true
    },
    phoneNumber:{
        type : String ,
    },
    googleId: { type: String },
    password:{
        type : String ,
    },
    dateOfBirth:{
        type : Date ,
    },
    isAdmin:{
        type : Boolean ,
        default : false},
    profilePic: {
        type: String,
        default: null
  },
    resetPasswordToken: String,
    resetPasswordExpire: Date
}, {timestamps : true})

module.exports = mongoose.model('User', userSchema)