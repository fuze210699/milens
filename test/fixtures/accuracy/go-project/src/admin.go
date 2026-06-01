package main

import "accuracy-go/src/models"

type AdminService struct {
	models.UserRepo
}

func NewAdminService() *AdminService {
	return &AdminService{UserRepo: models.UserRepo{}}
}

func (a *AdminService) AdminRegister(name, email string) *models.User {
	u := models.User{Name: name, Email: email}
	a.Save(u)
	return &u
}
